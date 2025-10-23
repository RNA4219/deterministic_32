import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const CAT32_BIN = import.meta.url.includes("/dist/tests/")
    ? new URL("../cli.js", import.meta.url).pathname
    : new URL("../dist/cli.js", import.meta.url).pathname;
test("cat32 --json=invalid reports an error", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CAT32_BIN, "--json=invalid"], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdoutChunks.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk);
    });
    const exitCode = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code, signal) => {
            if (signal !== null) {
                reject(new Error(`terminated by signal ${signal}`));
                return;
            }
            resolve(code ?? -1);
        });
    });
    assert.equal(stdoutChunks.join(""), "");
    assert.equal(exitCode, 2);
    assert.ok(stderrChunks.join("").includes('RangeError: unsupported --json value "invalid"'), "stderr should report unsupported --json value");
});
test("cat32 --json foo falls back to default format and treats foo as input", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const { existsSync } = (await dynamicImport("node:fs"));
    const distCliUrl = import.meta.url.includes("/dist/tests/")
        ? new URL("../cli.js", import.meta.url)
        : new URL("../dist/cli.js", import.meta.url);
    const sourceCliUrl = import.meta.url.includes("/dist/tests/")
        ? new URL("../src/cli.js", import.meta.url)
        : new URL("../dist/src/cli.js", import.meta.url);
    const cliScripts = [distCliUrl, sourceCliUrl]
        .map((url) => url.pathname)
        .filter((pathname, index, all) => all.indexOf(pathname) === index)
        .filter((pathname) => existsSync(pathname));
    assert.ok(cliScripts.length > 0, "expected at least one CLI script to test");
    const run = (args) => {
        const child = spawn(process.argv[0], args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const stdoutChunks = [];
        const stderrChunks = [];
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdoutChunks.push(chunk);
        });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
            stderrChunks.push(chunk);
        });
        return new Promise((resolve, reject) => {
            child.on("error", reject);
            child.on("close", (code, signal) => {
                if (signal !== null) {
                    reject(new Error(`terminated by signal ${signal}`));
                    return;
                }
                resolve({
                    exitCode: code ?? -1,
                    stdout: stdoutChunks.join(""),
                    stderr: stderrChunks.join(""),
                });
            });
        });
    };
    for (const scriptPath of cliScripts) {
        const baseline = await run([scriptPath, "foo"]);
        assert.equal(baseline.exitCode, 0, `expected baseline run for ${scriptPath} to exit successfully`);
        const withJson = await run([scriptPath, "--json", "foo"]);
        assert.equal(withJson.exitCode, 0, `expected --json foo run for ${scriptPath} to exit successfully`);
        assert.equal(withJson.stderr, "", `expected --json foo run for ${scriptPath} to produce no stderr output`);
        assert.equal(withJson.stdout, baseline.stdout, `expected --json foo run for ${scriptPath} to match baseline output`);
    }
});
