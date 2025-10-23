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

const isRunningFromDistTests = import.meta.url.includes("/dist/tests/");

const distDirectoryUrl = new URL(
  isRunningFromDistTests ? "../" : "../dist/",
  import.meta.url,
);

const DIST_CLI_BIN = new URL("./cli.js", distDirectoryUrl).pathname;

const CAT32_BIN = DIST_CLI_BIN;

const DIST_SRC_CLI_BIN = new URL("./src/cli.js", distDirectoryUrl).pathname;

type Cat32ExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type Cat32ExecutionOptions = {
  bin?: string;
};

async function runCat32WithInput(
  input: string,
  options: Cat32ExecutionOptions = {},
): Promise<Cat32ExecutionResult> {
  const { spawn } = (await dynamicImport("node:child_process")) as {
    spawn: SpawnFunction;
  };

  const { bin = CAT32_BIN } = options;

  const child = spawn(process.argv[0], [bin], {
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

  child.stdin?.end(input);

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

  return {
    exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
  };
}

test("cat32 trims trailing newline when reading stdin", async () => {
  const { exitCode, stdout, stderr } = await runCat32WithInput("foo\n");

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");

  const [line] = stdout.split("\n");
  const record = JSON.parse(line);

  assert.equal(record.key, JSON.stringify("foo"));
});

test("dist/cli.js trims trailing newline when reading stdin", async () => {
  const { exitCode, stdout, stderr } = await runCat32WithInput("foo\n", {
    bin: DIST_CLI_BIN,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");

  const [line] = stdout.split("\n");
  const record = JSON.parse(line);

  assert.equal(record.key, JSON.stringify("foo"));
  if (isRunningFromDistTests) {
    assert.equal(record.key.includes("\\\\r"), false);
  }
});

test("dist/src/cli.js trims trailing newline when reading stdin", async () => {
  const { exitCode, stdout, stderr } = await runCat32WithInput("foo\n", {
    bin: DIST_SRC_CLI_BIN,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");

  const [line] = stdout.split("\n");
  const record = JSON.parse(line);

  assert.equal(record.key, JSON.stringify("foo"));
});

test("cat32 normalizes carriage returns when reading stdin", async () => {
  const { exitCode, stdout, stderr } = await runCat32WithInput("foo\r\r\n");

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");

  const [line] = stdout.split("\n");
  const record = JSON.parse(line);

  assert.equal(record.key.startsWith("\""), true);
  assert.equal(record.key.endsWith("\""), true);
  const canonicalValue = record.key.slice(1, -1);

  assert.equal(canonicalValue, "foo\r");
  assert.equal(record.key.includes("\\\\r"), false);
  assert.equal(record.key.includes("\r"), true);
});
