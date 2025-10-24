import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const isRunningFromDistTests = import.meta.url.includes("/dist/tests/");
const distDirectoryUrl = new URL(isRunningFromDistTests ? "../" : "../dist/", import.meta.url);
const DIST_CLI_BIN = new URL("./cli.js", distDirectoryUrl).pathname;
const CAT32_BIN = DIST_CLI_BIN;
const DIST_SRC_CLI_BIN = new URL("./src/cli.js", distDirectoryUrl).pathname;
async function runCat32(args, options = {}) {
    const { spawn } = (await dynamicImport("node:child_process"));
    const { bin = CAT32_BIN } = options;
    const child = spawn(process.argv[0], [bin, ...args], {
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
    return {
        exitCode,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
    };
}
test("cat32 --json=invalid reports an error", async () => {
    const { exitCode, stdout, stderr } = await runCat32(["--json=invalid"]);
    assert.equal(stdout, "");
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes('RangeError: unsupported --json value "invalid"'), "stderr should report unsupported --json value");
});
test("cat32 --json foo falls back to default format", async () => {
    const { exitCode, stdout, stderr } = await runCat32(["--json", "foo"]);
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    const [line] = stdout.split("\n");
    const record = JSON.parse(line);
    assert.equal(record.key, JSON.stringify("foo"));
});
test("cat32 --json foo emits NDJSON", async () => {
    const { exitCode, stdout, stderr } = await runCat32(["--json", "foo"]);
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.ok(stdout.endsWith("\n"), "stdout should end with a newline for NDJSON");
    const lines = stdout.split("\n");
    const trailing = lines.pop();
    assert.equal(trailing, "", "stdout should terminate with a newline delimiter");
    const records = lines.filter((line) => line.length > 0).map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.equal(records[0].key, JSON.stringify("foo"));
});
test("dist/src/cli.js --json foo falls back to default format", async () => {
    const { exitCode, stdout, stderr } = await runCat32(["--json", "foo"], {
        bin: DIST_SRC_CLI_BIN,
    });
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    const [line] = stdout.split("\n");
    const record = JSON.parse(line);
    assert.equal(record.key, JSON.stringify("foo"));
});
