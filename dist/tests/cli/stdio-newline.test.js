import assert from "node:assert";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const CAT32_MODULE_SPECIFIER = import.meta.url.includes("/dist/tests/")
    ? new URL("../../cli.js", import.meta.url).href
    : new URL("../../dist/cli.js", import.meta.url).href;
async function runCat32(stderrIsTTY) {
    const { spawn } = (await dynamicImport("node:child_process"));
    const inlineScript = `process.stderr.isTTY = ${stderrIsTTY ? "true" : "false"};\nawait import(${JSON.stringify(CAT32_MODULE_SPECIFIER)});`;
    const child = spawn(process.argv[0], ["--input-type=module", "-e", inlineScript], {
        stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdin.end("foo\n");
    const [stdout, stderr, exitCode] = await Promise.all([
        collectStream(child.stdout),
        collectStream(child.stderr),
        waitForExit(child),
    ]);
    return { stdout, stderr, exitCode };
}
function collectStream(stream) {
    return new Promise((resolve) => {
        const chunks = [];
        const onData = (chunk) => {
            chunks.push(String(chunk));
        };
        const onSettled = () => {
            stream.removeListener("data", onData);
            stream.removeListener("end", onSettled);
            stream.removeListener("close", onSettled);
            resolve(chunks.join(""));
        };
        stream.on("data", onData);
        stream.on("end", onSettled);
        stream.on("close", onSettled);
    });
}
function waitForExit(child) {
    return new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code, signal) => {
            if (signal !== null) {
                reject(new Error(`terminated by signal ${signal}`));
                return;
            }
            resolve(code ?? -1);
        });
    });
}
function assertKeyWithTrailingNewline(output) {
    const [line] = output.split("\n");
    const record = JSON.parse(line);
    assert.equal(record.key, "\"foo\n\"");
}
test("cat32 preserves newline when stderr is a TTY", async () => {
    const result = await runCat32(true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assertKeyWithTrailingNewline(result.stdout);
});
test("cat32 preserves newline when stderr is not a TTY", async () => {
    const result = await runCat32(false);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assertKeyWithTrailingNewline(result.stdout);
});
