import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

type ProcessLike = {
  env?: Record<string, string | undefined>;
  platform?: string;
};

type ExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined> },
  callback: (error: unknown, stdout: string, stderr: string) => void,
) => void;

type ExecResult = {
  stdout: string;
  stderr: string;
};

const DIAGNOSTIC_PATTERNS = [
  "Cannot find name 'LOCAL_SYMBOL_OBJECT_REGISTRY'",
  "Cannot find name 'LocalSymbolHolder'",
  "Cannot find name 'LocalSymbolSentinelRecord'",
  "Cannot find name 'LocalSymbolFinalizerHolder'",
  "Cannot find name 'LocalSymbolFinalizerTarget'",
  "Cannot find name 'LocalSymbolWeakTarget'",
];

const collectOutput = (stdout: string | undefined, stderr: string | undefined): string =>
  `${stdout ?? ""}${stderr ?? ""}`;

const containsMissingLocalSymbolDiagnostic = (output: string): boolean =>
  DIAGNOSTIC_PATTERNS.some((pattern) => output.includes(pattern));

const { env: baseEnv = {}, platform = "linux" } = (process as unknown as ProcessLike) ?? {};

const getNpmExecutable = (): string => (platform === "win32" ? "npm.cmd" : "npm");

const runTsc = async (command: "npm run build"): Promise<ExecResult> => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };

  const repoRootUrl = new URL("../../..", import.meta.url);
  const repoRootPath = fileURLToPath(repoRootUrl);
  const env = { ...baseEnv, CI: "1" };

  const [file, ...args] = (() => {
    switch (command) {
      case "npm run build":
        return [getNpmExecutable(), "run", "build"] as const;
    }
  })();

  return await new Promise<ExecResult>((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: repoRootPath, env },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error ?? new Error("TypeScript build failed"), { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
};

test("npm run build succeeds without TypeScript errors", async () => {
  let result: ExecResult;
  try {
    result = await runTsc("npm run build");
  } catch (error) {
    const errorWithOutput = error as { stdout?: string; stderr?: string };
    const output = collectOutput(errorWithOutput?.stdout, errorWithOutput?.stderr);
    assert.ok(
      !containsMissingLocalSymbolDiagnostic(output),
      `TypeScript diagnostics detected:\n${output}`,
    );
    throw error;
  }

  const combinedOutput = collectOutput(result.stdout, result.stderr);
  assert.ok(
    !containsMissingLocalSymbolDiagnostic(combinedOutput),
    `TypeScript diagnostics detected:\n${combinedOutput}`,
  );
});
