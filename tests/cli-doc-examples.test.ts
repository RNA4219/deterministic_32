import test from "node:test";
import assert from "node:assert/strict";

type SpawnOptions = { stdio?: ("pipe" | "inherit" | "ignore")[] };
type SpawnedProcess = {
  stdout: { setEncoding(encoding: "utf8"): void; on(event: "data", listener: (chunk: string) => void): void } | null;
  stderr: { setEncoding(encoding: "utf8"): void; on(event: "data", listener: (chunk: string) => void): void } | null;
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};
type SpawnFunction = (command: string, args: string[], options?: SpawnOptions) => SpawnedProcess;
type FsPromisesModule = { readFile(path: string, encoding: "utf8"): Promise<string> };
type CliCase = { name: string; args: string[]; docCommand: string; docOutput: string };

const dynamicImport = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;
const isDist = import.meta.url.includes("/dist/tests/");
const distUrl = new URL(isDist ? "../" : "../dist/", import.meta.url);
const projectUrl = new URL("../", distUrl);
const cliDocPath = new URL("./docs/CLI.md", projectUrl).pathname;

const compact = '{"index":15,"label":"P","hash":"c6aac00f","key":"\\"foo\\""}';
const pretty = '{\n  "index": 15,\n  "label": "P",\n  "hash": "c6aac00f",\n  "key": "\\"foo\\""\n}';

const cases: CliCase[] = [
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

async function runCat32(binPath: string, args: string[]) {
  const { spawn } = (await dynamicImport("node:child_process")) as { spawn: SpawnFunction };
  const child = spawn(process.argv[0], [binPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    stdoutChunks.push(chunk);
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    stderrChunks.push(chunk);
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
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
  const { readFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
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
