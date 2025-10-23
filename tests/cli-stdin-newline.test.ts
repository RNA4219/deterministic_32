import test from "node:test";
import assert from "node:assert";

type SpawnOptions = {
  stdio?: ("pipe" | "inherit" | "ignore")[];
};

type SpawnedProcess = {
  stdin: { end(chunk: string): void } | null;
  stdout: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
  };
  stderr: {
    setEncoding(encoding: "utf8"): void;
    on(event: "data", listener: (chunk: string) => void): void;
  };
  on(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): void;
  on(event: "error", listener: (error: unknown) => void): void;
};

type SpawnFunction = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => SpawnedProcess;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const CAT32_BIN = import.meta.url.includes("/dist/tests/")
  ? new URL("../cli.js", import.meta.url).pathname
  : new URL("../dist/cli.js", import.meta.url).pathname;

test("cat32 trims trailing newline when reading stdin", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as {
    spawn: SpawnFunction;
  };

  const child = spawn(process.argv[0], [CAT32_BIN], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(chunk);
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk);
  });

  child.stdin?.end("foo\n");

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

  assert.equal(exitCode, 0);
  assert.equal(stderrChunks.join(""), "");

  const output = stdoutChunks.join("");
  const [line] = output.split("\n");
  const record = JSON.parse(line);

  assert.equal(record.key, JSON.stringify("foo"));
});
