import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const repoRootUrl = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);
const runnerUrl = new URL("--test-reporter=json", repoRootUrl);
const SIGNALS = ["SIGINT", "SIGTERM", "SIGQUIT"] as const;

type SpawnFunction = (...args: ReadonlyArray<unknown>) => unknown;

const createMockChild = () => {
  const exitListeners: Array<(code: number | null, signal: string | null) => void> = [];
  let scheduled = false;
  const child = {
    killed: false,
    kill: () => ((child.killed = true), true),
    once: (event: unknown, listener: unknown) => {
      if (event === "exit" && typeof listener === "function") {
        exitListeners.push(
          listener as (code: number | null, signal: string | null) => void,
        );
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => {
            while (exitListeners.length) {
              exitListeners.shift()!(0, null);
            }
          });
        }
      }
      return child;
    },
    on: () => child,
  };
  return child;
};

test("JSON reporter runner expands TS targets to dist JS paths", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const childProcessModule = require("node:child_process") as { spawn: SpawnFunction };
  const fsModule = require("node:fs") as { existsSync: (value: unknown) => boolean };
  const processWithSignals = process as typeof process & {
    listeners: (signal: (typeof SIGNALS)[number]) => Array<(...args: unknown[]) => void>;
    removeListener: (
      signal: (typeof SIGNALS)[number],
      listener: (...args: unknown[]) => void,
    ) => void;
  };

  const cleanups: Array<() => void> = [];
  const exitCodes: number[] = [];
  const spawnCalls: Array<ReadonlyArray<unknown>> = [];

  const originalArgv = process.argv;
  process.argv = [process.argv[0]!, "./--test-reporter=json", "tests/categorizer.test.ts"];
  cleanups.push(() => (process.argv = originalArgv));

  const baseline = new Map(
    SIGNALS.map((signal) => [signal, new Set(processWithSignals.listeners(signal))]),
  );
  cleanups.push(() => {
    for (const signal of SIGNALS) {
      const known = baseline.get(signal)!;
      for (const listener of processWithSignals.listeners(signal)) {
        if (!known.has(listener)) {
          processWithSignals.removeListener(signal, listener);
        }
      }
    }
  });

  const originalSpawn = childProcessModule.spawn;
  (childProcessModule as { spawn: SpawnFunction }).spawn = ((...args) => {
    spawnCalls.push(args);
    return createMockChild();
  }) as SpawnFunction;
  cleanups.push(() => {
    (childProcessModule as { spawn: SpawnFunction }).spawn = originalSpawn;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
    return undefined as never;
  }) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  const knownPaths = new Set([
    "dist/tests",
    "tests/categorizer.test.ts",
    "dist/tests/categorizer.test.js",
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (candidate) =>
    typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = originalExistsSync;
  });

  try {
    await import(`${runnerUrl.href}?test=${Date.now()}`);
    assert.equal(spawnCalls.length, 1);
    const spawnArgs = spawnCalls[0]![1] as ReadonlyArray<string>;
    assert.ok(Array.isArray(spawnArgs));
    assert.ok(spawnArgs.includes("dist/tests/categorizer.test.js"));
    assert.ok(!spawnArgs.includes("tests/categorizer.test.ts"));
    assert.deepEqual(exitCodes, [0]);
  } finally {
    while (cleanups.length) {
      cleanups.pop()?.();
    }
  }
});

test("prepareRunnerOptions prefers CLI targets when present", async () => {
  type PrepareRunnerOptions = (
    argv: readonly string[],
    overrides?: {
      existsSync?: (candidate: string) => boolean;
      defaultTargets?: readonly string[];
    },
  ) => { passthroughArgs: string[]; targets: string[] };

  const processWithEnv = process as typeof process & {
    env: Record<string, string | undefined> & {
      __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
    };
  };
  const previous = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
  processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

  try {
    const moduleExports = (await import(
      `${runnerUrl.href}?options=${Date.now()}`
    )) as { prepareRunnerOptions: PrepareRunnerOptions };

    const { prepareRunnerOptions } = moduleExports;
    assert.equal(typeof prepareRunnerOptions, "function");

    const existingPaths = new Set([
      "dist/tests",
      "dist/frontend/tests",
      "dist/tests/json-reporter.test.js",
    ]);

    const result = prepareRunnerOptions(
      ["node", "script", "dist/tests/json-reporter.test.js"],
      {
        existsSync: (candidate) => existingPaths.has(candidate),
      },
    );

    assert.deepEqual(result.targets, ["dist/tests/json-reporter.test.js"]);
  } finally {
    if (previous === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previous;
    }
  }
});
