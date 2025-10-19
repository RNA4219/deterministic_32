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

type PathModule = {
  join: (...segments: string[]) => string;
  resolve: (...segments: string[]) => string;
};

type RunScriptEnvironment = {
  readonly pathModule: PathModule;
  readonly repoRootPath: string;
};

type RunScriptOptions = {
  readonly argv: string[];
  readonly cwd?: string;
};

type RunScriptResult = {
  readonly spawnCalls: SpawnInvocation[];
  readonly exitCodes: number[];
  readonly importError: unknown;
};

const repoRootUrl = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);

const scriptUrl = new URL("scripts/run-tests.js", repoRootUrl);

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const loadEnvironment = async (): Promise<RunScriptEnvironment> => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (specifier: string | URL) => string;
  };
  const pathModule = (await dynamicImport("node:path")) as PathModule;
  const repoRootPath = pathModule.resolve(fileURLToPath(repoRootUrl));
  return { pathModule, repoRootPath };
};

const runScriptWithEnvironment = async (
  env: RunScriptEnvironment,
  options: RunScriptOptions,
): Promise<RunScriptResult> => {
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

  const processModule = process as NodeJS.Process & {
    cwd: () => string;
    chdir: (directory: string) => void;
  };
  const originalCwd = processModule.cwd();
  const targetCwd = options.cwd ?? env.repoRootPath;
  if (targetCwd !== originalCwd) {
    processModule.chdir(targetCwd);
  }
  cleanups.push(() => {
    processModule.chdir(originalCwd);
  });

  const originalArgv = process.argv;
  process.argv = [process.argv[0]!, scriptUrl.pathname, ...options.argv];
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

  return { spawnCalls, exitCodes, importError };
};

test("run-tests script maps CLI directory arguments to dist targets", async () => {
  const env = await loadEnvironment();

  const result = await runScriptWithEnvironment(env, {
    argv: ["tests"],
  });

  assert.equal(result.importError, undefined);
  assert.equal(result.spawnCalls.length, 1);

  const invocation = result.spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as string[];
  const expectedTarget = env.pathModule.join(env.repoRootPath, "dist", "tests");
  assert.ok(
    args.includes(expectedTarget),
    `expected spawn args to include ${expectedTarget}, received: ${args.join(", ")}`,
  );

  assert.deepEqual(result.exitCodes, [0]);
});

test("run-tests script normalizes absolute TS targets to dist JS paths", async () => {
  const env = await loadEnvironment();
  const absoluteTarget = env.pathModule.resolve(
    env.repoRootPath,
    "tests/example.test.ts",
  );

  const result = await runScriptWithEnvironment(env, {
    argv: [absoluteTarget],
    cwd: env.pathModule.join(env.repoRootPath, "dist"),
  });

  assert.equal(result.importError, undefined);
  assert.equal(result.spawnCalls.length, 1);

  const invocation = result.spawnCalls[0]!;
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as string[];
  const expectedTarget = env.pathModule.join(
    env.repoRootPath,
    "dist",
    "tests",
    "example.test.js",
  );
  assert.ok(
    args.includes(expectedTarget),
    `expected spawn args to include ${expectedTarget}, received: ${args.join(", ")}`,
  );
  assert.deepEqual(result.exitCodes, [0]);
});

test(
  "run-tests script preserves flag values for known option arguments",
  async () => {
    const env = await loadEnvironment();

    const result = await runScriptWithEnvironment(env, {
      argv: ["--", "--test-name-pattern", "frontend/tests"],
    });

    assert.equal(result.importError, undefined);
    assert.equal(result.spawnCalls.length, 1);

    const invocation = result.spawnCalls[0]!;
    assert.ok(Array.isArray(invocation.args));
    const args = invocation.args as string[];

    const flagIndex = args.indexOf("--test-name-pattern");
    assert.ok(
      flagIndex !== -1,
      `expected spawn args to include --test-name-pattern, received: ${args.join(", ")}`,
    );
    assert.equal(args[flagIndex + 1], "frontend/tests");

    const defaultTargets = [
      env.pathModule.join(env.repoRootPath, "dist", "tests"),
      env.pathModule.join(env.repoRootPath, "dist", "frontend", "tests"),
    ];
    for (const defaultTarget of defaultTargets) {
      assert.ok(
        args.includes(defaultTarget),
        `expected spawn args to include ${defaultTarget}, received: ${args.join(", ")}`,
      );
    }

    assert.deepEqual(result.exitCodes, [0]);
  },
);

test(
  "run-tests script omits default targets when CLI specifies TS target",
  async () => {
    const env = await loadEnvironment();

    const result = await runScriptWithEnvironment(env, {
      argv: ["tests/example.test.ts"],
    });

    assert.equal(result.importError, undefined);
    assert.equal(result.spawnCalls.length, 1);

    const invocation = result.spawnCalls[0]!;
    assert.ok(Array.isArray(invocation.args));
    const args = invocation.args as string[];
    const expectedTarget = env.pathModule.join(
      env.repoRootPath,
      "dist",
      "tests",
      "example.test.js",
    );
    assert.ok(
      args.includes(expectedTarget),
      `expected spawn args to include ${expectedTarget}, received: ${args.join(", ")}`,
    );

    const defaultTargets = [
      env.pathModule.join(env.repoRootPath, "dist", "tests"),
      env.pathModule.join(env.repoRootPath, "dist", "frontend", "tests"),
    ];
    for (const defaultTarget of defaultTargets) {
      assert.ok(
        !args.includes(defaultTarget),
        `expected spawn args to omit ${defaultTarget}, received: ${args.join(", ")}`,
      );
    }

    assert.deepEqual(result.exitCodes, [0]);
  },
);

test(
  "run-tests script falls back to default targets when CLI only provides reporter options",
  async () => {
    const env = await loadEnvironment();

    const result = await runScriptWithEnvironment(env, {
      argv: ["--test-reporter", "spec"],
    });

    assert.equal(result.importError, undefined);
    assert.equal(result.spawnCalls.length, 1);

    const invocation = result.spawnCalls[0]!;
    assert.ok(Array.isArray(invocation.args));
    const args = invocation.args as string[];

    const defaultTargets = [
      env.pathModule.join(env.repoRootPath, "dist", "tests"),
      env.pathModule.join(env.repoRootPath, "dist", "frontend", "tests"),
    ];
    for (const defaultTarget of defaultTargets) {
      assert.ok(
        args.includes(defaultTarget),
        `expected spawn args to include ${defaultTarget}, received: ${args.join(", ")}`,
      );
    }

    assert.ok(
      args.includes("--test-reporter"),
      `expected spawn args to include --test-reporter, received: ${args.join(", ")}`,
    );
    assert.ok(
      args.includes("spec"),
      `expected spawn args to include reporter value spec, received: ${args.join(", ")}`,
    );

    assert.deepEqual(result.exitCodes, [0]);
  },
);

test(
  "run-tests script positions value-less flags before default targets",
  async () => {
    const env = await loadEnvironment();

    const result = await runScriptWithEnvironment(env, {
      argv: ["--", "--watch"],
    });

    assert.equal(result.importError, undefined);
    assert.equal(result.spawnCalls.length, 1);

    const invocation = result.spawnCalls[0]!;
    assert.ok(Array.isArray(invocation.args));
    const args = invocation.args as string[];

    const defaultTargets = [
      env.pathModule.join(env.repoRootPath, "dist", "tests"),
      env.pathModule.join(env.repoRootPath, "dist", "frontend", "tests"),
    ];

    const watchIndex = args.indexOf("--watch");
    assert.equal(
      watchIndex,
      1,
      `expected --watch to appear immediately after --test, received: ${args.join(", ")}`,
    );

    for (const defaultTarget of defaultTargets) {
      const defaultIndex = args.indexOf(defaultTarget);
      assert.ok(
        defaultIndex > watchIndex,
        `expected ${defaultTarget} to appear after --watch, received: ${args.join(", ")}`,
      );
    }

    assert.deepEqual(result.exitCodes, [0]);
  },
);

for (const directoryName of ["frontend", "dist"]) {
  test(
    `run-tests script resolves cwd and default targets from repo root when started from ${directoryName}/`,
    async () => {
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
      processModule.chdir(pathModule.join(repoRootPath, directoryName));
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
    },
  );
}
