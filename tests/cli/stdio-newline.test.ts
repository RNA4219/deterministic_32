import assert from "node:assert";
import test from "node:test";

type ReadableStream = {
  setEncoding(encoding: "utf8"): void;
  on(event: "data", listener: (chunk: unknown) => void): void;
  on(event: "end" | "close", listener: () => void): void;
  removeListener(event: "data", listener: (chunk: unknown) => void): void;
  removeListener(event: "end" | "close", listener: () => void): void;
};

type NodeSignal = string;

type ChildProcessWithoutNullStreams = {
  stdout: ReadableStream;
  stderr: ReadableStream;
  stdin: { end(chunk: string): void };
  on(event: "error", listener: (error: Error) => void): void;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeSignal | null) => void,
  ): void;
};

type Spawn = (
  command: string,
  args: readonly string[],
  options: { stdio: ("pipe" | "inherit" | "ignore")[] },
) => ChildProcessWithoutNullStreams;

type SpawnModule = { spawn: Spawn };

type RunResult = { exitCode: number; stdout: string; stderr: string };

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<SpawnModule>;

const CAT32_MODULE_SPECIFIER = import.meta.url.includes("/dist/tests/")
  ? new URL("../../cli.js", import.meta.url).href
  : new URL("../../dist/cli.js", import.meta.url).href;

async function runCat32(stderrIsTTY: boolean): Promise<RunResult> {
  const { spawn } = (await dynamicImport("node:child_process")) as SpawnModule;
  const inlineScript = `process.stderr.isTTY = ${stderrIsTTY ? "true" : "false"};\nawait import(${JSON.stringify(
    CAT32_MODULE_SPECIFIER,
  )});`;
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

function collectStream(stream: ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const onData = (chunk: unknown) => {
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

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code: number | null, signal: NodeSignal | null) => {
      if (signal !== null) {
        reject(new Error(`terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? -1);
    });
  });
}

function assertKeyWithoutTrailingNewline(output: string) {
  const [line] = output.split("\n");
  const record = JSON.parse(line);
  assert.equal(record.key, JSON.stringify("foo"));
}

test("cat32 preserves newline when stderr is a TTY", async () => {
  const result = await runCat32(true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assertKeyWithoutTrailingNewline(result.stdout);
});

test("cat32 preserves newline when stderr is not a TTY", async () => {
  const result = await runCat32(false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assertKeyWithoutTrailingNewline(result.stdout);
});
