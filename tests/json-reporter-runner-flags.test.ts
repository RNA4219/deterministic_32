import assert from "node:assert/strict";
import test from "node:test";

type Signal = "SIGINT" | "SIGTERM" | "SIGQUIT";

type Listener = (...args: unknown[]) => void;

const createMockChildProcess = () => {
  const onceListeners = new Map<string, Listener[]>();

  const child = {
    killed: false,
    once(event: string, listener: Listener) {
      const listeners = onceListeners.get(event) ?? [];
      listeners.push(listener);
      onceListeners.set(event, listeners);
      return child;
    },
    kill(_signal?: unknown) {
      child.killed = true;
      return true;
    },
  };

  return {
    child,
    emit(event: string, ...args: unknown[]) {
      const listeners = onceListeners.get(event);
      if (!listeners) {
        return;
      }

      onceListeners.delete(event);
      for (const listener of listeners) {
        listener(...args);
      }
    },
  };
};

const repoRootUrl = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);

test("JSON reporter runner forwards CLI flags to spawned process", async () => {
  const spawnCalls: Array<{
    command: string;
    args: string[];
  }> = [];

  const globalOverride = globalThis as {
    __CAT32_TEST_SPAWN__?: (
      command: string,
      args: readonly string[],
      options?: unknown,
    ) => unknown;
  };

  const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;

  globalOverride.__CAT32_TEST_SPAWN__ = (
    command: string,
    args: readonly string[],
    _options?: unknown,
  ) => {
    spawnCalls.push({ command, args: [...args] });

    const child = createMockChildProcess();
    queueMicrotask(() => {
      child.emit("exit", 0, null);
    });

    return child.child;
  };

  const nodeProcess = process as unknown as {
    argv: string[];
    execPath: string;
    pid: number;
    env: Record<string, string | undefined>;
    exit: (code?: number) => never;
    kill: (pid: number, signal: string) => void;
    on: (event: string, listener: Listener) => void;
    listeners: (event: string) => Listener[];
    removeListener: (event: string, listener: Listener) => void;
  };

  const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
  const runnerPath = decodeURIComponent(runnerUrl.pathname);
  const originalArgv = nodeProcess.argv;
  const trackedSignals: Signal[] = ["SIGINT", "SIGTERM", "SIGQUIT"];
  const previousListeners = new Map<Signal, Set<Listener>>();

  for (const signal of trackedSignals) {
    previousListeners.set(signal, new Set(nodeProcess.listeners(signal)));
  }

  const originalExit = nodeProcess.exit;
  const exitCalls: Array<number | undefined> = [];
  nodeProcess.exit = ((code?: number) => {
    exitCalls.push(code);
    return undefined as never;
  }) as (code?: number) => never;

  nodeProcess.argv = [
    nodeProcess.execPath,
    runnerPath,
    "--test-name-pattern",
    "foo",
  ];

  try {
    await import(`${runnerUrl.href}?${Date.now()}`);
  } finally {
    nodeProcess.argv = originalArgv;
    nodeProcess.exit = originalExit;
    globalOverride.__CAT32_TEST_SPAWN__ = originalSpawnOverride;

    for (const signal of trackedSignals) {
      const before = previousListeners.get(signal) ?? new Set();
      for (const listener of nodeProcess.listeners(signal)) {
        if (!before.has(listener)) {
          nodeProcess.removeListener(signal, listener);
        }
      }
    }
  }

  assert.deepEqual(exitCalls.at(-1), 0);
  assert.equal(spawnCalls.length, 1);

  const forwardedArgs = spawnCalls[0]!.args.slice(-2);
  assert.deepEqual(forwardedArgs, ["--test-name-pattern", "foo"]);
});
