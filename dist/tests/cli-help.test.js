import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const CAT32_BIN = import.meta.url.includes("/dist/tests/")
    ? new URL("../cli.js", import.meta.url).pathname
    : new URL("../dist/cli.js", import.meta.url).pathname;
const HELP_OUTPUT = [
    "Usage: cat32 [options] [input]",
    "",
    "Options:",
    "  --salt <value>           Salt to apply when assigning a category.",
    "  --namespace <value>      Namespace that scopes generated categories.",
    "  --normalize <value>      Unicode normalization form (default: nfkc).",
    "  --json [format]          Output JSON format: compact or pretty (default: compact).",
    "  --pretty                 Shorthand for --json pretty.",
    "  --help                   Show this help message and exit.",
    "",
].join("\n");
test("cat32 --help prints usage information", async () => {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [CAT32_BIN, "--help"], {
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
    assert.equal(exitCode, 0);
    assert.equal(stderrChunks.join(""), "");
    assert.equal(stdoutChunks.join(""), HELP_OUTPUT);
});
