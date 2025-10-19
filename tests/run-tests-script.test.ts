import assert from "node:assert/strict";
import test from "node:test";

type FakeChildProcess = {
  on: (event: string, listener: (...args: unknown[]) => void) => FakeChildProcess;
  emit: (event: string, ...args: unknown[]) => FakeChildProcess;
  kill: () => boolean;
};

type SpawnInvocation = {
  readonly command: unknown;
  readonly args: unknown[];
  readonly options: unknown;
  readonly child: FakeChildProcess;
};

const repoRootUrl = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);

const scriptUrl = new URL("scripts/run-tests.js", repoRootUrl);

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

test("run-tests script normalizes absolute TS targets to dist JS paths", async () => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (specifier: string | URL) => string;
  };
  const pathModule = (await dynamicImport("node:path")) as {
    join: (...segments: string[]) => string;
    resolve: (...segments: string[]) => string;
  };

  const spawnCalls: SpawnInvocation[] = [];
  const exitCodes: number[] = [];
  const cleanups: Array<() => void> = [];
  let importError: unknown;

  const globalOverride = globalThis as {
    __CAT32_TEST_SPAWN__?: (
      command: unknown,
      args: unknown,
      options: unknown,
    ) => FakeChildProcess;
  };

  const spawnOverride = (
    command: unknown,
    args: unknown,
    options: unknown,
  ): FakeChildProcess => {
    const listeners = new Map<string, Array<(...listenerArgs: unknown[]) => void>>();
    const child: FakeChildProcess = {
      on: (event, listener) => {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
        return child;
      },
      emit: (event, ...listenerArgs) => {
        const registered = listeners.get(event);
        if (registered) {
          for (const listener of registered) {
            listener(...listenerArgs);
          }
        }
        return child;
      },
      kill: () => true,
    };

    spawnCalls.push({
      command,
      args: Array.isArray(args) ? [...args] : [],
      options,
      child,
    });

    return child;
  };

  const previousSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
  globalOverride.__CAT32_TEST_SPAWN__ = spawnOverride;
  cleanups.push(() => {
    if (previousSpawnOverride === undefined) {
      delete globalOverride.__CAT32_TEST_SPAWN__;
    } else {
      globalOverride.__CAT32_TEST_SPAWN__ = previousSpawnOverride;
    }
  });

  const repoRootPath = pathModule.resolve(fileURLToPath(repoRootUrl));
  const processModule = process as NodeJS.Process & {
    cwd: () => string;
    chdir: (directory: string) => void;
  };
  const originalCwd = processModule.cwd();
  processModule.chdir(pathModule.join(repoRootPath, "dist"));
  cleanups.push(() => {
    processModule.chdir(originalCwd);
  });

  const absoluteTarget = pathModule.resolve(
    repoRootPath,
    "tests/example.test.ts",
  );

  const originalArgv = process.argv;
  process.argv = [process.argv[0]!, scriptUrl.pathname, absoluteTarget];
  cleanups.push(() => {
    process.argv = originalArgv;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
    return undefined as never;
  }) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  try {
    await import(`${scriptUrl.href}?t=${Date.now()}`);
    const invocation = spawnCalls[0];
    invocation?.child.emit("exit", 0, null);
  } catch (error) {
    importError = error;
  } finally {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  }

  assert.equal(importError, undefined);
  assert.equal(spawnCalls.length, 1);

  const invocation = spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as string[];
  const expectedTarget = pathModule.join(
    repoRootPath,
    "dist",
    "tests",
    "example.test.js",
  );
  assert.ok(
    args.includes(expectedTarget),
    `expected spawn args to include ${expectedTarget}, received: ${args.join(", ")}`,
  );
  assert.deepEqual(exitCodes, [0]);
});

test("run-tests script resolves cwd and default targets from repo root", async () => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (specifier: string | URL) => string;
  };
  const pathModule = (await dynamicImport("node:path")) as {
    join: (...segments: string[]) => string;
    resolve: (...segments: string[]) => string;
  };

  const spawnCalls: SpawnInvocation[] = [];
  const exitCodes: number[] = [];
  const cleanups: Array<() => void> = [];
  let importError: unknown;

  const globalOverride = globalThis as {
    __CAT32_TEST_SPAWN__?: (
      command: unknown,
      args: unknown,
      options: unknown,
    ) => FakeChildProcess;
  };

  const spawnOverride = (
    command: unknown,
    args: unknown,
    options: unknown,
  ): FakeChildProcess => {
    const listeners = new Map<string, Array<(...listenerArgs: unknown[]) => void>>();
    const child: FakeChildProcess = {
      on: (event, listener) => {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
        return child;
      },
      emit: (event, ...listenerArgs) => {
        const registered = listeners.get(event);
        if (registered) {
          for (const listener of registered) {
            listener(...listenerArgs);
          }
        }
        return child;
      },
      kill: () => true,
    };

    spawnCalls.push({
      command,
      args: Array.isArray(args) ? [...args] : [],
      options,
      child,
    });

    return child;
  };

  const previousSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
  globalOverride.__CAT32_TEST_SPAWN__ = spawnOverride;
  cleanups.push(() => {
    if (previousSpawnOverride === undefined) {
      delete globalOverride.__CAT32_TEST_SPAWN__;
    } else {
      globalOverride.__CAT32_TEST_SPAWN__ = previousSpawnOverride;
    }
  });

  const repoRootPath = pathModule.resolve(fileURLToPath(repoRootUrl));
  const processModule = process as NodeJS.Process & {
    cwd: () => string;
    chdir: (directory: string) => void;
  };
  const originalCwd = processModule.cwd();
  processModule.chdir(pathModule.join(repoRootPath, "frontend"));
  cleanups.push(() => {
    processModule.chdir(originalCwd);
  });

  const originalArgv = process.argv;
  process.argv = [process.argv[0]!, scriptUrl.pathname];
  cleanups.push(() => {
    process.argv = originalArgv;
  });

  const originalExit = process.exit;
  (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
    return undefined as never;
  }) as typeof originalExit;
  cleanups.push(() => {
    (process as { exit: typeof originalExit }).exit = originalExit;
  });

  try {
    await import(`${scriptUrl.href}?t=${Date.now()}`);
    const invocation = spawnCalls[0];
    invocation?.child.emit("exit", 0, null);
  } catch (error) {
    importError = error;
  } finally {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  }

  assert.equal(importError, undefined);
  assert.equal(spawnCalls.length, 1);

  const invocation = spawnCalls[0]!;
  assert.equal(
    (invocation.options as { cwd?: unknown } | undefined)?.cwd,
    repoRootPath,
  );

  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as string[];
  const defaultTarget = pathModule.join(repoRootPath, "dist", "tests");
  const frontendTarget = pathModule.join(
    repoRootPath,
    "dist",
    "frontend",
    "tests",
  );

  assert.ok(
    args.includes(defaultTarget),
    `expected spawn args to include ${defaultTarget}, received: ${args.join(", ")}`,
  );
  assert.ok(
    args.includes(frontendTarget),
    `expected spawn args to include ${frontendTarget}, received: ${args.join(", ")}`,
  );

  assert.deepEqual(exitCodes, [0]);
});
