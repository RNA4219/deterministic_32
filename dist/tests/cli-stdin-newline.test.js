import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const CAT32_BIN = import.meta.url.includes("/dist/tests/")
    ? new URL("../cli.js", import.meta.url).pathname
    : new URL("../dist/cli.js", import.meta.url).pathname;
test("cat32 preserves canonical key newline when reading stdin", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CAT32_BIN], {
        stdio: ["pipe", "pipe", "pipe"],
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
    child.stdin?.end("foo\n");
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
    assert.equal(exitCode, 0);
    assert.equal(stderrChunks.join(""), "");
    const output = stdoutChunks.join("");
    const [line] = output.split("\n");
    const record = JSON.parse(line);
    assert.equal(record.key, "\"foo\n\"");
});
