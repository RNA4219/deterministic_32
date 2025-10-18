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

const loadResolveDestination = async (
  token: string,
): Promise<(override: string | null) => string> => {
  const processWithEnv = process as typeof process & {
    env: Record<string, string | undefined> & {
      __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
    };
  };
  const previousSkip = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
  processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

  try {
    const moduleExports = (await import(
      `${runnerUrl.href}?${token}=${Date.now()}`,
    )) as { resolveDestination?: (override: string | null) => string };
    if (typeof moduleExports.resolveDestination !== "function") {
      throw new Error("resolveDestination not loaded");
    }
    return moduleExports.resolveDestination;
  } finally {
    if (previousSkip === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousSkip;
    }
  }
};

test("JSON reporter runner uses dist target when invoked with TS input", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (url: string | URL) => string;
  };
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
    mkdirSync: (path: unknown, options?: unknown) => unknown;
  };
  const pathModule = require("node:path") as {
    resolve: (...segments: string[]) => string;
    dirname: (value: string) => string;
  };

  const projectRoot = pathModule.resolve(fileURLToPath(repoRootUrl));

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const mkdirCalls: string[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const knownPaths = new Set([
    "tests/example.test.ts",
    pathModule.resolve("tests/example.test.ts"),
    "dist/tests/example.test.js",
    pathModule.resolve("dist/tests/example.test.js"),
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) => typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync =
      originalExistsSync;
  });

  const originalMkdirSync = fsModule.mkdirSync;
  (fsModule as {
    mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  }).mkdirSync = (directory) => {
    mkdirCalls.push(directory);
  };
  cleanups.push(() => {
    (fsModule as {
      mkdirSync: (
        path: string,
        options?: { recursive?: boolean },
      ) => void;
    }).mkdirSync = originalMkdirSync;
  });

  const originalArgv = process.argv;
  process.argv = [
    process.argv[0]!,
    "./--test-reporter=json",
    "--test-reporter-destination",
    "tmp/out.jsonl",
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
  assert.ok(invocation.options && typeof invocation.options === "object");
  assert.ok(Array.isArray(invocation.args));
  const args = invocation.args as ReadonlyArray<string>;
  const options = invocation.options as { cwd?: unknown };
  assert.equal(options.cwd, projectRoot);
  assert.ok(args.includes("dist/tests/example.test.js"));
  const destinationArgs = args.filter((value) =>
    value.startsWith("--test-reporter-destination="),
  );
  assert.equal(destinationArgs.length, 1);
  const resolvedDestination = `--test-reporter-destination=${pathModule.resolve(
    "tmp/out.jsonl",
  )}`;
  assert.equal(destinationArgs[0], resolvedDestination);
  const expectedDirectory = pathModule.dirname(pathModule.resolve("tmp/out.jsonl"));
  assert.ok(mkdirCalls.includes(expectedDirectory));
  assert.deepEqual(exitCodes, [0]);
});

test(
  "JSON reporter runner maps default targets from nested directory to dist",
  async () => {
    const { createRequire } = (await dynamicImport("node:module")) as {
      createRequire: (specifier: string | URL) => (id: string) => unknown;
    };
    const require = createRequire(import.meta.url);
    const fsModule = require("node:fs") as {
      mkdirSync: (path: unknown, options?: unknown) => unknown;
      mkdtempSync: (prefix: string) => string;
      rmdirSync: (path: string) => void;
    };
    const pathModule = require("node:path") as {
      join: (...segments: string[]) => string;
      resolve: (...segments: string[]) => string;
      dirname: (value: string) => string;
    };
    const { fileURLToPath } = (await dynamicImport("node:url")) as {
      fileURLToPath: (url: string | URL) => string;
    };

    const projectRoot = fileURLToPath(repoRootUrl);
    const cleanups: Array<() => void> = [];
    const spawnCalls: SpawnCall[] = [];
    const mkdirCalls: string[] = [];
    const exitCodes: number[] = [];
    let thrown: unknown;

    const originalMkdirSync = fsModule.mkdirSync;
    (fsModule as {
      mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
    }).mkdirSync = (directory) => {
      mkdirCalls.push(directory);
    };
    cleanups.push(() => {
      (fsModule as {
        mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
      }).mkdirSync = originalMkdirSync;
    });

    const processWithCwd = process as typeof process & {
      cwd: () => string;
      chdir: (directory: string) => void;
    };
    const originalCwd = processWithCwd.cwd();
    const testsDirectory = fileURLToPath(new URL("./tests/", repoRootUrl));
    const temporaryDirectory = fsModule.mkdtempSync(
      pathModule.join(testsDirectory, "json-runner-"),
    );
    processWithCwd.chdir(temporaryDirectory);
    cleanups.push(() => {
      processWithCwd.chdir(originalCwd);
      fsModule.rmdirSync(temporaryDirectory);
    });

    const originalArgv = process.argv;
    process.argv = [process.argv[0]!, "./--test-reporter=json"];
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
      await import(`${runnerUrl.href}?nested=${Date.now()}`);
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
    const normalizedTargets = args
      .filter((value) => typeof value === "string" && !value.startsWith("--"))
      .map((value) => value.replace(/\\+/g, "/"));
    assert.ok(normalizedTargets.includes("dist/tests"));
    assert.ok(normalizedTargets.includes("dist/frontend/tests"));
    const expectedDirectory = pathModule.dirname(
      pathModule.resolve(projectRoot, "logs/test.jsonl"),
    );
    assert.ok(mkdirCalls.includes(expectedDirectory));
    assert.deepEqual(exitCodes, [0]);
  },
);

test(
  "JSON reporter runner resolves destination from project root when invoked in subdirectory",
  async () => {
    const { createRequire } = (await dynamicImport("node:module")) as {
      createRequire: (specifier: string | URL) => (id: string) => unknown;
    };
    const require = createRequire(import.meta.url);
    const fsModule = require("node:fs") as {
      mkdirSync: (path: unknown, options?: unknown) => unknown;
    };
    const pathModule = require("node:path") as {
      resolve: (...segments: string[]) => string;
      dirname: (value: string) => string;
      isAbsolute: (value: string) => boolean;
    };
    const { fileURLToPath } = (await dynamicImport("node:url")) as {
      fileURLToPath: (url: string | URL) => string;
    };

    const projectRoot = fileURLToPath(repoRootUrl);
    const activeResolveDestination = await loadResolveDestination("destination");

    const expectedDefaultDestination = activeResolveDestination(null);
    assert.equal(
      expectedDefaultDestination,
      pathModule.resolve(projectRoot, "logs/test.jsonl"),
    );
    const expectedOverrideDestination = activeResolveDestination("tmp/out.jsonl");
    assert.equal(
      expectedOverrideDestination,
      pathModule.resolve(projectRoot, "tmp/out.jsonl"),
    );

    const cleanups: Array<() => void> = [];
    const mkdirCalls: string[] = [];
    const spawnCalls: SpawnCall[] = [];
    const exitCodes: number[] = [];
    let thrown: unknown;

    const originalMkdirSync = fsModule.mkdirSync;
    (fsModule as {
      mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
    }).mkdirSync = (directory) => {
      mkdirCalls.push(directory);
    };
    cleanups.push(() => {
      (fsModule as {
        mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
      }).mkdirSync = originalMkdirSync;
    });

    const processWithCwd = process as typeof process & {
      cwd: () => string;
      chdir: (directory: string) => void;
    };
    const originalCwd = processWithCwd.cwd();
    const testsDirectory = fileURLToPath(new URL("./tests/", repoRootUrl));
    processWithCwd.chdir(testsDirectory);
    cleanups.push(() => {
      processWithCwd.chdir(originalCwd);
    });

    const originalArgv = process.argv;
    process.argv = [process.argv[0]!, "./--test-reporter=json"];
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
      await import(`${runnerUrl.href}?subdir=${Date.now()}`);
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
    const destinationArgs = args.filter((value) =>
      value.startsWith("--test-reporter-destination="),
    );
    assert.equal(destinationArgs.length, 1);
    const expectedDestinationArg = `--test-reporter-destination=${expectedDefaultDestination}`;
    assert.equal(destinationArgs[0], expectedDestinationArg);
    const expectedDirectory = pathModule.dirname(expectedDefaultDestination);
    assert.ok(mkdirCalls.includes(expectedDirectory));
    const targetArgs = args.filter(
      (value) => typeof value === "string" && !value.startsWith("--") && value !== "--test",
    );
    const hasAbsoluteTargets =
      targetArgs.length > 0 && targetArgs.every((value) => pathModule.isAbsolute(value));
    const options = invocation.options as { cwd?: unknown };
    const usesProjectRootCwd =
      options !== null &&
      typeof options === "object" &&
      typeof options.cwd === "string" &&
      pathModule.resolve(options.cwd) === pathModule.resolve(projectRoot);
    assert.ok(
      hasAbsoluteTargets || usesProjectRootCwd,
      "runner should spawn with absolute targets or project root cwd",
    );
    assert.deepEqual(exitCodes, [0]);
  },
);

test(
  "JSON reporter runner uses CLI override destination from project root when invoked in subdirectory",
  async () => {
    const { createRequire } = (await dynamicImport("node:module")) as {
      createRequire: (specifier: string | URL) => (id: string) => unknown;
    };
    const require = createRequire(import.meta.url);
    const fsModule = require("node:fs") as {
      mkdirSync: (path: unknown, options?: unknown) => unknown;
    };
    const pathModule = require("node:path") as {
      resolve: (...segments: string[]) => string;
      dirname: (value: string) => string;
    };
    const { fileURLToPath } = (await dynamicImport("node:url")) as {
      fileURLToPath: (url: string | URL) => string;
    };

    const projectRoot = fileURLToPath(repoRootUrl);
    const activeResolveDestination = await loadResolveDestination(
      "cli-destination",
    );

    const expectedOverrideDestination = activeResolveDestination("tmp/cli-out.jsonl");
    assert.equal(
      expectedOverrideDestination,
      pathModule.resolve(projectRoot, "tmp/cli-out.jsonl"),
    );

    const cleanups: Array<() => void> = [];
    const mkdirCalls: string[] = [];
    const spawnCalls: SpawnCall[] = [];
    const exitCodes: number[] = [];
    let thrown: unknown;

    const originalMkdirSync = fsModule.mkdirSync;
    (fsModule as {
      mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
    }).mkdirSync = (directory) => {
      mkdirCalls.push(directory);
    };
    cleanups.push(() => {
      (fsModule as {
        mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
      }).mkdirSync = originalMkdirSync;
    });

    const processWithCwd = process as typeof process & {
      cwd: () => string;
      chdir: (directory: string) => void;
    };
    const originalCwd = processWithCwd.cwd();
    const testsDirectory = fileURLToPath(new URL("./tests/", repoRootUrl));
    processWithCwd.chdir(testsDirectory);
    cleanups.push(() => {
      processWithCwd.chdir(originalCwd);
    });

    const originalArgv = process.argv;
    process.argv = [
      process.argv[0]!,
      "./--test-reporter=json",
      "--test-reporter-destination",
      "tmp/cli-out.jsonl",
    ];
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
      await import(`${runnerUrl.href}?cli-run=${Date.now()}`);
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
    const destinationArgs = args.filter((value) =>
      value.startsWith("--test-reporter-destination="),
    );
    assert.equal(destinationArgs.length, 1);
    const expectedDestinationArg = `--test-reporter-destination=${expectedOverrideDestination}`;
    assert.equal(destinationArgs[0], expectedDestinationArg);
    const expectedDirectory = pathModule.dirname(expectedOverrideDestination);
    assert.ok(mkdirCalls.includes(expectedDirectory));
    assert.deepEqual(exitCodes, [0]);
  },
);

test("JSON reporter runner resolves TS targets when invoked from tests directory", async () => {
  const { createRequire } = (await dynamicImport("node:module")) as {
    createRequire: (specifier: string | URL) => (id: string) => unknown;
  };
  const require = createRequire(import.meta.url);
  const fsModule = require("node:fs") as {
    existsSync: (value: unknown) => boolean;
  };
  const pathModuleForCategorizer = require("node:path") as {
    resolve: (...segments: string[]) => string;
  };

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const knownPaths = new Set([
    "categorizer.test.ts",
    pathModuleForCategorizer.resolve("categorizer.test.ts"),
    pathModuleForCategorizer.resolve("tests/categorizer.test.ts"),
    "dist/tests/categorizer.test.js",
    pathModuleForCategorizer.resolve("dist/tests/categorizer.test.js"),
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) => typeof candidate === "string" && knownPaths.has(candidate);
  cleanups.push(() => {
    (fsModule as { existsSync: (value: unknown) => boolean }).existsSync =
      originalExistsSync;
  });

  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (url: string | URL) => string;
  };
  const testsDirectory = fileURLToPath(new URL("./tests/", repoRootUrl));
  const processWithCwd = process as typeof process & {
    cwd: () => string;
    chdir: (directory: string) => void;
  };
  const originalCwd = processWithCwd.cwd();
  processWithCwd.chdir(testsDirectory);
  cleanups.push(() => {
    processWithCwd.chdir(originalCwd);
  });

  const originalArgv = process.argv;
  process.argv = [
    process.argv[0]!,
    "./--test-reporter=json",
    "categorizer.test.ts",
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
  assert.ok(args.includes("dist/tests/categorizer.test.js"));
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
  const pathModuleForDirectory = require("node:path") as {
    resolve: (...segments: string[]) => string;
  };

  const cleanups: Array<() => void> = [];
  const spawnCalls: SpawnCall[] = [];
  const exitCodes: number[] = [];
  let thrown: unknown;

  const knownPaths = new Set([
    "dist/tests",
    pathModuleForDirectory.resolve("dist/tests"),
  ]);
  const originalExistsSync = fsModule.existsSync;
  (fsModule as { existsSync: (value: unknown) => boolean }).existsSync = (
    candidate,
  ) =>
    typeof candidate === "string" &&
    (knownPaths.has(candidate) ||
      knownPaths.has(pathModuleForDirectory.resolve(candidate)));
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
    resolve("dist/tests/example.test.js"),
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

    const directoryResult = prepareRunnerOptions(["node", "script", "tests"], {
      existsSync: (candidate) => candidate === "tests",
    });

    assert.deepEqual(directoryResult.targets, ["dist/tests"]);

    const destinationResult = prepareRunnerOptions(
      ["node", "script", "--test-reporter-destination", "tmp/out.jsonl"],
      { defaultTargets: [] },
    );

    assert.equal(destinationResult.destinationOverride, "tmp/out.jsonl");
    assert.deepEqual(destinationResult.passthroughArgs, []);
  } finally {
    if (previous === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previous;
    }
  }
});

test("prepareRunnerOptions maps directory targets relative to the script", async () => {
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

  const processWithEnv = process as typeof process & {
    env: Record<string, string | undefined> & {
      __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
    };
  };
  const previous = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
  processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

  const processWithCwd = process as typeof process & {
    cwd: () => string;
    chdir: (directory: string) => void;
  };
  const originalCwd = processWithCwd.cwd();

  try {
    const moduleExports = (await import(
      `${runnerUrl.href}?options=${Date.now()}`
    )) as { prepareRunnerOptions: PrepareRunnerOptions };

    const { prepareRunnerOptions } = moduleExports;
    assert.equal(typeof prepareRunnerOptions, "function");

    const { resolve } = (await dynamicImport("node:path")) as {
      resolve: (...segments: string[]) => string;
    };
    const existingPaths = new Set([
      "dist/frontend/tests",
      resolve("dist/frontend/tests"),
    ]);

    const { fileURLToPath } = (await dynamicImport("node:url")) as {
      fileURLToPath: (url: string | URL) => string;
    };
    const frontendDirectory = fileURLToPath(new URL("./frontend/", repoRootUrl));

    processWithCwd.chdir(frontendDirectory);

    const result = prepareRunnerOptions(["node", "script", "tests"], {
      existsSync: (candidate) =>
        typeof candidate === "string" &&
        (existingPaths.has(candidate) || existingPaths.has(resolve(candidate))),
    });

    assert.deepEqual(result.targets, ["dist/frontend/tests"]);
  } finally {
    processWithCwd.chdir(originalCwd);

    if (previous === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previous;
    }
  }
});

test(
  "prepareRunnerOptions keeps default dist targets when invoked from frontend directory",
  async () => {
    const processWithEnv = process as typeof process & {
      env: Record<string, string | undefined> & {
        __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
      };
    };
    const previousEnv = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

    const processWithCwd = process as typeof process & {
      cwd: () => string;
      chdir: (directory: string) => void;
    };
    const originalCwd = processWithCwd.cwd();

    try {
      const moduleExports = (await import(
        `${runnerUrl.href}?frontend-default=${Date.now()}`,
      )) as { prepareRunnerOptions: PrepareRunnerOptions };

      const { prepareRunnerOptions } = moduleExports;
      assert.equal(typeof prepareRunnerOptions, "function");

      const { fileURLToPath } = (await dynamicImport("node:url")) as {
        fileURLToPath: (url: string | URL) => string;
      };
      const { resolve } = (await dynamicImport("node:path")) as {
        resolve: (...segments: string[]) => string;
      };

      const projectRoot = fileURLToPath(repoRootUrl);
      const frontendDirectory = fileURLToPath(new URL("./frontend/", repoRootUrl));
      processWithCwd.chdir(frontendDirectory);

      const knownPaths = new Set([
        "dist/tests",
        "dist/frontend/tests",
        resolve(projectRoot, "dist/tests"),
        resolve(projectRoot, "dist/frontend/tests"),
      ]);

      const result = prepareRunnerOptions(["node", "script"], {
        existsSync: (candidate) =>
          typeof candidate === "string" &&
          (knownPaths.has(candidate) || knownPaths.has(resolve(candidate))),
      });

      assert.deepEqual(result.targets, ["dist/tests", "dist/frontend/tests"]);
    } finally {
      processWithCwd.chdir(originalCwd);

      if (previousEnv === undefined) {
        delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
      } else {
        processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousEnv;
      }
    }
  },
);

test(
  "prepareRunnerOptions keeps default dist targets when existsSync only reports dist entries from frontend directory",
  async () => {
    const processWithEnv = process as typeof process & {
      env: Record<string, string | undefined> & {
        __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
      };
    };
    const previousEnv = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

    const processWithCwd = process as typeof process & {
      cwd: () => string;
      chdir: (directory: string) => void;
    };
    const originalCwd = processWithCwd.cwd();

    try {
      const moduleExports = (await import(
        `${runnerUrl.href}?frontend-relative=${Date.now()}`,
      )) as { prepareRunnerOptions: PrepareRunnerOptions };

      const { prepareRunnerOptions } = moduleExports;
      assert.equal(typeof prepareRunnerOptions, "function");

      const { fileURLToPath } = (await dynamicImport("node:url")) as {
        fileURLToPath: (url: string | URL) => string;
      };

      const frontendDirectory = fileURLToPath(new URL("./frontend/", repoRootUrl));
      processWithCwd.chdir(frontendDirectory);

      const relativeDistEntries = new Set(["dist/tests", "dist/frontend/tests"]);

      const result = prepareRunnerOptions(["node", "script"], {
        existsSync: (candidate) =>
          typeof candidate === "string" && relativeDistEntries.has(candidate),
      });

      assert.deepEqual(result.targets, ["dist/tests", "dist/frontend/tests"]);
    } finally {
      processWithCwd.chdir(originalCwd);

      if (previousEnv === undefined) {
        delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
      } else {
        processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousEnv;
      }
    }
  },
);
