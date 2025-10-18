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
