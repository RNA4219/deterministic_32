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
test("CLI docs describe pretty JSON behavior", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const projectRoot = new URL("../..", import.meta.url);
    const [readme, cliSpec] = await Promise.all([
        readFile(new URL("README.md", projectRoot), "utf8"),
        readFile(new URL("docs/CLI.md", projectRoot), "utf8"),
    ]);
    assert.ok(readme.includes("`--json=pretty` / `--pretty` / `--json --pretty` は複数行の整形 JSON"), "README should explain pretty-formatting produces multi-line JSON");
    assert.ok(readme.includes("NDJSON はデフォルト/compact モードのみ"), "README should clarify NDJSON availability");
    assert.ok(cliSpec.includes("整形モードでは 1 レコードが複数行の JSON"), "CLI spec should note multi-line pretty output");
    assert.ok(cliSpec.includes("NDJSON (1 行 1 JSON オブジェクト) になるのは compact/既定モード"), "CLI spec should restrict NDJSON to compact/default modes");
});
