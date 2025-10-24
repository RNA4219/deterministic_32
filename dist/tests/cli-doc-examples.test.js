import test from "node:test";
import assert from "node:assert/strict";
const dynamicImport = new Function("specifier", "return import(specifier);");
const isDist = import.meta.url.includes("/dist/tests/");
const distUrl = new URL(isDist ? "../" : "../dist/", import.meta.url);
const projectUrl = new URL("../", distUrl);
const cliDocPath = new URL("./docs/CLI.md", projectUrl).pathname;
const compact = '{"index":15,"label":"P","hash":"c6aac00f","key":"\\"foo\\""}';
const pretty = '{\n  "index": 15,\n  "label": "P",\n  "hash": "c6aac00f",\n  "key": "\\"foo\\""\n}';
const cases = [
    { name: "cat32 foo", args: ["foo"], docCommand: "$ cat32 foo", docOutput: compact },
    { name: "cat32 --json foo", args: ["--json", "foo"], docCommand: "$ cat32 --json foo", docOutput: compact },
    { name: "cat32 --json=pretty foo", args: ["--json=pretty", "foo"], docCommand: "$ cat32 --json=pretty foo", docOutput: pretty },
    { name: "cat32 --pretty foo", args: ["--pretty", "foo"], docCommand: "$ cat32 --pretty foo", docOutput: pretty },
    { name: "cat32 --json --pretty foo", args: ["--json", "--pretty", "foo"], docCommand: "$ cat32 --json --pretty foo", docOutput: pretty },
];
const bins = [
    { label: "dist/cli.js", path: new URL("./cli.js", distUrl).pathname },
    { label: "dist/src/cli.js", path: new URL("./src/cli.js", distUrl).pathname },
];
async function runCat32(binPath, args) {
    const { spawn } = (await dynamicImport("node:child_process"));
    const child = spawn(process.argv[0], [binPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
        stdoutChunks.push(chunk);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
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
    return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}
test("CLI examples in docs stay in sync", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const doc = await readFile(cliDocPath, "utf8");
    for (const cliCase of cases) {
        assert.ok(doc.includes(cliCase.docCommand), `docs should contain command: ${cliCase.docCommand}`);
        assert.ok(doc.includes(cliCase.docOutput), `docs should contain output for ${cliCase.name}`);
        for (const bin of bins) {
            const { exitCode, stdout, stderr } = await runCat32(bin.path, cliCase.args);
            assert.equal(exitCode, 0);
            assert.equal(stderr, "");
            assert.equal(stdout, `${cliCase.docOutput}\n`);
        }
    }
});
