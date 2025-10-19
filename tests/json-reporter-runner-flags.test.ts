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

type PrepareRunnerOptions = (
  argv: readonly string[],
  overrides?: {
    existsSync?: (candidate: string) => boolean;
    defaultTargets?: readonly string[];
  },
) => {
  passthroughArgs: string[];
  targets: string[];
  destinationOverride: string | null;
};

const loadPrepareRunnerOptions = async (
  token: string,
): Promise<PrepareRunnerOptions> => {
  const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
  const processWithEnv = process as typeof process & {
    env: Record<string, string | undefined> & {
      __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
    };
  };
  const previousSkip = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
  processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

  try {
    const moduleExports = (await import(
      `${runnerUrl.href}?prepare-runner=${Date.now()}-${token}`,
    )) as { prepareRunnerOptions?: PrepareRunnerOptions };

    if (typeof moduleExports.prepareRunnerOptions !== "function") {
      throw new Error("prepareRunnerOptions not loaded");
    }

    return moduleExports.prepareRunnerOptions;
  } finally {
    if (previousSkip === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousSkip;
    }
  }
};

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

test("JSON reporter runner forwards flag values that require separate tokens", async () => {
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
    "--import",
    "./scripts/register.js",
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
  assert.deepEqual(forwardedArgs, ["--import", "./scripts/register.js"]);
});

test("JSON reporter runner does not treat CLI flag values as targets", async () => {
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
    "dist",
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

  const forwardedArgs = spawnCalls[0]!.args;
  const flagIndex = forwardedArgs.indexOf("--test-name-pattern");
  assert.ok(flagIndex !== -1);
  assert.equal(forwardedArgs[flagIndex + 1], "dist");
  assert.equal(forwardedArgs.slice(0, flagIndex).indexOf("dist"), -1);
});

test("JSON reporter runner does not treat skip pattern values as targets", async () => {
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
    "--test-skip-pattern",
    "tests/example.test.js",
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

  const forwardedArgs = spawnCalls[0]!.args;
  const flagIndex = forwardedArgs.indexOf("--test-skip-pattern");
  assert.ok(flagIndex !== -1);
  assert.equal(forwardedArgs[flagIndex + 1], "tests/example.test.js");
  assert.equal(
    forwardedArgs.slice(0, flagIndex).indexOf("tests/example.test.js"),
    -1,
  );
});

test(
  "prepareRunnerOptions keeps default targets when --test-match uses separate value argument",
  async () => {
    const prepareRunnerOptions = await loadPrepareRunnerOptions("test-match");

    const result = prepareRunnerOptions(
      ["node", "script", "--test-match", "**/*.test.js"],
      {
        existsSync: (candidate) => {
          if (typeof candidate !== "string") {
            return false;
          }

          return candidate.endsWith("dist/tests") ||
            candidate.endsWith("dist/frontend/tests");
        },
        defaultTargets: ["dist/tests", "dist/frontend/tests"],
      },
    );

    assert.deepEqual(result.passthroughArgs, [
      "--test-match",
      "**/*.test.js",
    ]);
    assert.deepEqual(result.targets, [
      "dist/tests",
      "dist/frontend/tests",
    ]);
    assert.equal(result.destinationOverride, null);
  },
);
