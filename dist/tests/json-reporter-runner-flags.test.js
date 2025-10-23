import assert from "node:assert/strict";
import test from "node:test";
const createMockChildProcess = () => {
    const onceListeners = new Map();
    const child = {
        killed: false,
        once(event, listener) {
            const listeners = onceListeners.get(event) ?? [];
            listeners.push(listener);
            onceListeners.set(event, listeners);
            return child;
        },
        kill(_signal) {
            child.killed = true;
            return true;
        },
    };
    return {
        child,
        emit(event, ...args) {
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
const loadPrepareRunnerOptions = async (token) => {
    const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
    const processWithEnv = process;
    const previousSkip = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";
    try {
        const moduleExports = (await import(`${runnerUrl.href}?prepare-runner=${Date.now()}-${token}`));
        if (typeof moduleExports.prepareRunnerOptions !== "function") {
            throw new Error("prepareRunnerOptions not loaded");
        }
        return moduleExports.prepareRunnerOptions;
    }
    finally {
        if (previousSkip === undefined) {
            delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
        }
        else {
            processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousSkip;
        }
    }
};
test("JSON reporter runner forwards CLI flags to spawned process", async () => {
    const spawnCalls = [];
    const globalOverride = globalThis;
    const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
    globalOverride.__CAT32_TEST_SPAWN__ = (command, args, _options) => {
        spawnCalls.push({ command, args: [...args] });
        const child = createMockChildProcess();
        queueMicrotask(() => {
            child.emit("exit", 0, null);
        });
        return child.child;
    };
    const nodeProcess = process;
    const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
    const runnerPath = decodeURIComponent(runnerUrl.pathname);
    const originalArgv = nodeProcess.argv;
    const trackedSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    const previousListeners = new Map();
    for (const signal of trackedSignals) {
        previousListeners.set(signal, new Set(nodeProcess.listeners(signal)));
    }
    const originalExit = nodeProcess.exit;
    const exitCalls = [];
    nodeProcess.exit = ((code) => {
        exitCalls.push(code);
        return undefined;
    });
    nodeProcess.argv = [
        nodeProcess.execPath,
        runnerPath,
        "--test-name-pattern",
        "foo",
    ];
    try {
        await import(`${runnerUrl.href}?${Date.now()}`);
    }
    finally {
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
    const forwardedArgs = spawnCalls[0].args.slice(-2);
    assert.deepEqual(forwardedArgs, ["--test-name-pattern", "foo"]);
});
test("JSON reporter runner forwards flag values that require separate tokens", async () => {
    const spawnCalls = [];
    const globalOverride = globalThis;
    const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
    globalOverride.__CAT32_TEST_SPAWN__ = (command, args, _options) => {
        spawnCalls.push({ command, args: [...args] });
        const child = createMockChildProcess();
        queueMicrotask(() => {
            child.emit("exit", 0, null);
        });
        return child.child;
    };
    const nodeProcess = process;
    const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
    const runnerPath = decodeURIComponent(runnerUrl.pathname);
    const originalArgv = nodeProcess.argv;
    const trackedSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    const previousListeners = new Map();
    for (const signal of trackedSignals) {
        previousListeners.set(signal, new Set(nodeProcess.listeners(signal)));
    }
    const originalExit = nodeProcess.exit;
    const exitCalls = [];
    nodeProcess.exit = ((code) => {
        exitCalls.push(code);
        return undefined;
    });
    nodeProcess.argv = [
        nodeProcess.execPath,
        runnerPath,
        "--import",
        "./scripts/register.js",
    ];
    try {
        await import(`${runnerUrl.href}?${Date.now()}`);
    }
    finally {
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
    const forwardedArgs = spawnCalls[0].args.slice(-2);
    assert.deepEqual(forwardedArgs, ["--import", "./scripts/register.js"]);
});
test("JSON reporter runner does not treat CLI flag values as targets", async () => {
    const spawnCalls = [];
    const globalOverride = globalThis;
    const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
    globalOverride.__CAT32_TEST_SPAWN__ = (command, args, _options) => {
        spawnCalls.push({ command, args: [...args] });
        const child = createMockChildProcess();
        queueMicrotask(() => {
            child.emit("exit", 0, null);
        });
        return child.child;
    };
    const nodeProcess = process;
    const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
    const runnerPath = decodeURIComponent(runnerUrl.pathname);
    const originalArgv = nodeProcess.argv;
    const trackedSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    const previousListeners = new Map();
    for (const signal of trackedSignals) {
        previousListeners.set(signal, new Set(nodeProcess.listeners(signal)));
    }
    const originalExit = nodeProcess.exit;
    const exitCalls = [];
    nodeProcess.exit = ((code) => {
        exitCalls.push(code);
        return undefined;
    });
    nodeProcess.argv = [
        nodeProcess.execPath,
        runnerPath,
        "--test-name-pattern",
        "dist",
    ];
    try {
        await import(`${runnerUrl.href}?${Date.now()}`);
    }
    finally {
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
    const forwardedArgs = spawnCalls[0].args;
    const flagIndex = forwardedArgs.indexOf("--test-name-pattern");
    assert.ok(flagIndex !== -1);
    assert.equal(forwardedArgs[flagIndex + 1], "dist");
    assert.equal(forwardedArgs.slice(0, flagIndex).indexOf("dist"), -1);
});
test("JSON reporter runner does not treat skip pattern values as targets", async () => {
    const spawnCalls = [];
    const globalOverride = globalThis;
    const originalSpawnOverride = globalOverride.__CAT32_TEST_SPAWN__;
    globalOverride.__CAT32_TEST_SPAWN__ = (command, args, _options) => {
        spawnCalls.push({ command, args: [...args] });
        const child = createMockChildProcess();
        queueMicrotask(() => {
            child.emit("exit", 0, null);
        });
        return child.child;
    };
    const nodeProcess = process;
    const runnerUrl = new URL("./--test-reporter=json", repoRootUrl);
    const runnerPath = decodeURIComponent(runnerUrl.pathname);
    const originalArgv = nodeProcess.argv;
    const trackedSignals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    const previousListeners = new Map();
    for (const signal of trackedSignals) {
        previousListeners.set(signal, new Set(nodeProcess.listeners(signal)));
    }
    const originalExit = nodeProcess.exit;
    const exitCalls = [];
    nodeProcess.exit = ((code) => {
        exitCalls.push(code);
        return undefined;
    });
    nodeProcess.argv = [
        nodeProcess.execPath,
        runnerPath,
        "--test-skip-pattern",
        "tests/example.test.js",
    ];
    try {
        await import(`${runnerUrl.href}?${Date.now()}`);
    }
    finally {
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
    const forwardedArgs = spawnCalls[0].args;
    const flagIndex = forwardedArgs.indexOf("--test-skip-pattern");
    assert.ok(flagIndex !== -1);
    assert.equal(forwardedArgs[flagIndex + 1], "tests/example.test.js");
    assert.equal(forwardedArgs.slice(0, flagIndex).indexOf("tests/example.test.js"), -1);
});
test("prepareRunnerOptions keeps default targets when --test-match uses separate value argument", async () => {
    const prepareRunnerOptions = await loadPrepareRunnerOptions("test-match");
    const result = prepareRunnerOptions(["node", "script", "--test-match", "**/*.test.js"], {
        existsSync: (candidate) => {
            if (typeof candidate !== "string") {
                return false;
            }
            return candidate.endsWith("dist/tests") ||
                candidate.endsWith("dist/frontend/tests");
        },
        defaultTargets: ["dist/tests", "dist/frontend/tests"],
    });
    assert.deepEqual(result.passthroughArgs, [
        "--test-match",
        "**/*.test.js",
    ]);
    assert.deepEqual(result.targets, [
        "dist/tests",
        "dist/frontend/tests",
    ]);
    assert.equal(result.destinationOverride, null);
});
