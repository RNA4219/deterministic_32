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

test("JSON reporter runner respects --test-reporter-destination", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
    mkdirSync: (directory: unknown, options?: unknown) => unknown;
  };
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
  const mkdirCalls: Array<[unknown, unknown?]> = [];

  const globalOverride = globalThis as { __CAT32_TEST_SPAWN__?: SpawnFunction };
  const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
  globalOverride.__CAT32_TEST_SPAWN__ = ((...args) => {
    spawnCalls.push(args);
    return createMockChild();
  }) as SpawnFunction;
  cleanups.push(() => {
    if (originalSpawnOverride === undefined) {
      delete globalOverride.__CAT32_TEST_SPAWN__;
    } else {
      globalOverride.__CAT32_TEST_SPAWN__ = originalSpawnOverride;
    }
  });

  const originalArgv = process.argv;
  process.argv = [
    process.argv[0]!,
    "./--test-reporter=json",
    "--test-reporter-destination",
    "tmp/out.jsonl",
    "tests/categorizer.test.ts",
  ];
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

  const originalMkdirSync = fsModule.mkdirSync;
  (fsModule as {
    mkdirSync: (directory: unknown, options?: unknown) => unknown;
  }).mkdirSync = (directory, options) => {
    mkdirCalls.push([directory, options]);
    return undefined;
  };
  cleanups.push(() => {
    (fsModule as {
      mkdirSync: (directory: unknown, options?: unknown) => unknown;
    }).mkdirSync = originalMkdirSync;
  });

  try {
    await import(`${runnerUrl.href}?test=${Date.now()}`);
    assert.equal(spawnCalls.length, 1);
    const spawnArgs = spawnCalls[0]![1] as ReadonlyArray<string>;
    assert.ok(Array.isArray(spawnArgs));
    assert.ok(spawnArgs.includes("dist/tests/categorizer.test.js"));
    assert.ok(spawnArgs.includes("--test-reporter-destination=tmp/out.jsonl"));
    assert.deepEqual(mkdirCalls, [["tmp", { recursive: true }]]);
    assert.deepEqual(exitCodes, [0]);
  } finally {
    while (cleanups.length) {
      cleanups.pop()?.();
    }
  }
});
