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

type SpawnCall = {
  readonly command: unknown;
  readonly args: unknown;
  readonly options: unknown;
};

test("JSON reporter runner uses dist target when invoked with TS input", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
  };

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const knownPaths = new Set([
    "tests/example.test.ts",
    "dist/tests/example.test.js",
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) => typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync =
      originalExistsSync;
  });

  const originalArgv = process.argv;
  process.argv = [
    process.argv[0]!,
    "./--test-reporter=json",
    "tests/example.test.ts",
  ];
  cleanups.push(() => {
    process.argv = originalArgv;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = (
    (code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }
  ) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  const spawnOverride = (
    command: unknown,
    args: unknown,
    options: unknown,
  ) => {
    const child = {
      killed: false,
      kill: () => {
        child.killed = true;
        return true;
      },
      once: (event: unknown, listener: unknown) => {
        if (event === "exit" && typeof listener === "function") {
          queueMicrotask(() => {
            (listener as (code: number, signal: string | null) => void)(0, null);
          });
        }
        return child;
      },
    };
    spawnCalls.push({ command, args, options });
    return child;
  };
  (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride }).__CAT32_TEST_SPAWN__ =
    spawnOverride;
  cleanups.push(() => {
    delete (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride })
      .__CAT32_TEST_SPAWN__;
  });

  try {
    await import(`${runnerUrl.href}?t=${Date.now()}`);
  } catch (error) {
    thrown = error;
  } finally {
    while (cleanups.length) {
      cleanups.pop()?.();
    }
  }

  assert.equal(thrown, undefined);
  assert.equal(spawnCalls.length, 1);
  const invocation = spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as ReadonlyArray<string>;
  assert.ok(args.includes("dist/tests/example.test.js"));
  assert.deepEqual(exitCodes, [0]);
});

test("JSON reporter runner maps directory targets into dist", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
  };

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const knownPaths = new Set(["dist/tests"]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) => typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync =
      originalExistsSync;
  });

  const originalArgv = process.argv;
  process.argv = [process.argv[0]!, "./--test-reporter=json", "tests"];
  cleanups.push(() => {
    process.argv = originalArgv;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = (
    (code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }
  ) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  const spawnOverride = (
    command: unknown,
    args: unknown,
    options: unknown,
  ) => {
    const child = {
      killed: false,
      kill: () => {
        child.killed = true;
        return true;
      },
      once: (event: unknown, listener: unknown) => {
        if (event === "exit" && typeof listener === "function") {
          queueMicrotask(() => {
            (listener as (code: number, signal: string | null) => void)(0, null);
          });
        }
        return child;
      },
    };
    spawnCalls.push({ command, args, options });
    return child;
  };
  (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride }).__CAT32_TEST_SPAWN__ =
    spawnOverride;
  cleanups.push(() => {
    delete (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride })
      .__CAT32_TEST_SPAWN__;
  });

  try {
    await import(`${runnerUrl.href}?t=${Date.now()}`);
  } catch (error) {
    thrown = error;
  } finally {
    while (cleanups.length) {
      cleanups.pop()?.();
    }
  }

  assert.equal(thrown, undefined);
  assert.equal(spawnCalls.length, 1);
  const invocation = spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as ReadonlyArray<string>;
  assert.ok(args.includes("dist/tests"));
  assert.deepEqual(exitCodes, [0]);
});

test("JSON reporter runner maps absolute TS targets into dist", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
  };

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const { resolve } = (await dynamicImport("node:path")) as {
    resolve: (...segments: string[]) => string;
  };
  const absoluteTarget = resolve("tests/example.test.ts");
  const knownPaths = new Set([
    absoluteTarget,
    "dist/tests/example.test.js",
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) => typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync =
      originalExistsSync;
  });

  const originalArgv = process.argv;
  process.argv = [
    process.argv[0]!,
    "./--test-reporter=json",
    absoluteTarget,
  ];
  cleanups.push(() => {
    process.argv = originalArgv;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = (
    (code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }
  ) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  const spawnOverride = (
    command: unknown,
    args: unknown,
    options: unknown,
  ) => {
    const child = {
      killed: false,
      kill: () => {
        child.killed = true;
        return true;
      },
      once: (event: unknown, listener: unknown) => {
        if (event === "exit" && typeof listener === "function") {
          queueMicrotask(() => {
            (listener as (code: number, signal: string | null) => void)(0, null);
          });
        }
        return child;
      },
    };
    spawnCalls.push({ command, args, options });
    return child;
  };
  (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride }).__CAT32_TEST_SPAWN__ =
    spawnOverride;
  cleanups.push(() => {
    delete (globalThis as { __CAT32_TEST_SPAWN__?: typeof spawnOverride })
      .__CAT32_TEST_SPAWN__;
  });

  try {
    await import(`${runnerUrl.href}?t=${Date.now()}`);
  } catch (error) {
    thrown = error;
  } finally {
    while (cleanups.length) {
      cleanups.pop()?.();
    }
  }

  assert.equal(thrown, undefined);
  assert.equal(spawnCalls.length, 1);
  const invocation = spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as ReadonlyArray<string>;
  assert.ok(args.includes("dist/tests/example.test.js"));
  assert.deepEqual(exitCodes, [0]);
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
