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

const isDist = import.meta.url.includes("/dist/tests/");
const distUrl = new URL(isDist ? "../" : "../dist/", import.meta.url);
const CLI_BINARIES = [
  { label: "dist/cli.js", path: new URL("./cli.js", distUrl).pathname },
  { label: "dist/src/cli.js", path: new URL("./src/cli.js", distUrl).pathname },
] as const;

const CAT32_BIN = CLI_BINARIES[0].path;

type RunResult = { exitCode: number; stdout: string; stderr: string };

async function runCat32(binPath: string, args: string[]): Promise<RunResult> {
  const { spawn } = (await dynamicImport("node:child_process")) as {
    spawn: SpawnFunction;
  };

  const child = spawn(process.argv[0], [binPath, ...args], {
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

  return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

function assertMultilineJson(output: string, label: string) {
  assert.ok(output.endsWith("\n"), `${label} should end output with a newline`);
  const trimmed = output.trimEnd();
  const lines = trimmed.split("\n");
  assert.ok(lines.length > 1, `${label} should emit multiple lines in pretty mode`);
}

test("cat32 --json=invalid reports an error", async () => {
  const { spawn } = (await dynamicImport("node:child_process")) as {
    spawn: SpawnFunction;
  };

  const child = spawn(
    process.argv[0],
    [CAT32_BIN, "--json=invalid"],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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

  assert.equal(stdoutChunks.join(""), "");
  assert.equal(exitCode, 2);
  assert.ok(
    stderrChunks.join("").includes('RangeError: unsupported --json value "invalid"'),
    "stderr should report unsupported --json value",
  );
});

for (const binary of CLI_BINARIES) {
  test(`cat32 --json=pretty foo emits multi-line JSON (${binary.label})`, async () => {
    const { exitCode, stdout, stderr } = await runCat32(binary.path, [
      "--json=pretty",
      "foo",
    ]);
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assertMultilineJson(stdout, binary.label);
  });

  test(`cat32 --pretty foo emits multi-line JSON (${binary.label})`, async () => {
    const { exitCode, stdout, stderr } = await runCat32(binary.path, [
      "--pretty",
      "foo",
    ]);
    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assertMultilineJson(stdout, binary.label);
  });
}
