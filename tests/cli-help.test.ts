import test from "node:test";
import assert from "node:assert";

type SpawnOptions = {
  stdio?: ("pipe" | "inherit" | "ignore")[];
};

type SpawnedProcess = {
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
  const { spawn } = (await dynamicImport("node:child_process")) as {
    spawn: SpawnFunction;
  };

  const child = spawn(process.argv[0], [CAT32_BIN, "--help"], {
    stdio: ["ignore", "pipe", "pipe"],
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
  assert.equal(stdoutChunks.join(""), HELP_OUTPUT);
});
