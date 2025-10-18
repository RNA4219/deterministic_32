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

type Mkdir = (path: string | URL, options: { recursive?: boolean }) => Promise<void>;
type WriteFile = (path: string | URL, data: string) => Promise<void>;
type Rm = (
  path: string | URL,
  options: { recursive?: boolean; force?: boolean },
) => Promise<void>;
type Access = (path: string | URL, mode?: number) => Promise<void>;
type ExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined> },
  callback: (error: unknown, stdout: string, stderr: string) => void,
) => void;
const runTest = test as unknown as (
  name: string,
  options: { timeout?: number },
  fn: () => Promise<void>,
) => void;

const { env: baseEnv = {}, platform = "linux" } = (process as unknown as ProcessLike) ?? {};

const getNpmExecutable = (): string => (platform === "win32" ? "npm.cmd" : "npm");

const runBuild = async (
  execFile: ExecFile,
  repoRootPath: string,
  env: Record<string, string | undefined>,
  args: readonly string[] = [],
): Promise<void> =>
  await new Promise<void>((resolve, reject) => {
    execFile(
      getNpmExecutable(),
      ["run", "build", ...args],
      { cwd: repoRootPath, env },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error ?? {}, { stdout, stderr }));
          return;
        }
        resolve();
      },
    );
  });

runTest("build copies nested source files", { timeout: 60_000 }, async () => {
  const { mkdir, writeFile, rm, access } = (await dynamicImport("node:fs/promises")) as {
    mkdir: Mkdir;
    writeFile: WriteFile;
    rm: Rm;
    access: Access;
  };
  const { execFile } = (await dynamicImport("node:child_process")) as {
    execFile: ExecFile;
  };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };

  const repoRootUrl = new URL("../..", import.meta.url);
  const repoRootPath = fileURLToPath(repoRootUrl);
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const tempSourceDirUrl = new URL(`src/tmp-build-artifacts-${uniqueSuffix}/`, repoRootUrl);
  const nestedSourceFileUrl = new URL("nested.ts", tempSourceDirUrl);
  const nestedDistDirUrl = new URL(`dist/tmp-build-artifacts-${uniqueSuffix}/`, repoRootUrl);
  const nestedDistFileUrl = new URL("nested.js", nestedDistDirUrl);
  const nestedDistSourceDirUrl = new URL(
    `dist/src/tmp-build-artifacts-${uniqueSuffix}/`,
    repoRootUrl,
  );

  await mkdir(tempSourceDirUrl, { recursive: true });
  await writeFile(nestedSourceFileUrl, "export const nestedValue: number = 42;\n");

  const env = { ...baseEnv, CI: "1" };

  try {
    await runBuild(execFile, repoRootPath, env);

    const fileIsPresent = await access(nestedDistFileUrl)
      .then(() => true)
      .catch((error) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "ENOENT"
        ) {
          return false;
        }
        throw error;
      });

    assert.ok(fileIsPresent, "expected nested output file to be emitted");
  } finally {
    await rm(tempSourceDirUrl, { recursive: true, force: true });
    await rm(nestedDistDirUrl, { recursive: true, force: true });
    await rm(nestedDistSourceDirUrl, { recursive: true, force: true });
  }
});

runTest("build forwards additional CLI arguments to TypeScript", {}, async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as {
    execFile: ExecFile;
  };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };

  const repoRootUrl = new URL("../..", import.meta.url);
  const repoRootPath = fileURLToPath(repoRootUrl);
  const env = { ...baseEnv, CI: "1" };

  await runBuild(execFile, repoRootPath, env, ["--", "--pretty", "false"]);
});

runTest("build respects CLI overrides when npm metadata is unavailable", {}, async () => {
  const { execFile } = (await dynamicImport("node:child_process")) as {
    execFile: ExecFile;
  };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };
  const { writeFile, rm } = (await dynamicImport("node:fs/promises")) as {
    writeFile: WriteFile;
    rm: Rm;
  };

  const repoRootUrl = new URL("../..", import.meta.url);
  const repoRootPath = fileURLToPath(repoRootUrl);
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const tempTsconfigUrl = new URL(`tsconfig.build-metadata-${uniqueSuffix}.json`, repoRootUrl);

  await writeFile(
    tempTsconfigUrl,
    `${JSON.stringify(
      {
        extends: "./tsconfig.json",
        files: ["./src/does-not-exist.ts"],
      },
      null,
      2,
    )}\n`,
  );

  const env = { ...baseEnv, CI: "1", npm_config_argv: "{}" };

  try {
    let failure: unknown;
    try {
      await runBuild(execFile, repoRootPath, env, [
        "--",
        "--project",
        fileURLToPath(tempTsconfigUrl),
      ]);
    } catch (error) {
      failure = error;
    }

    assert.ok(failure, "expected custom project compilation to fail");

    assert.ok(
      failure && typeof failure === "object",
      "expected build failure to expose output",
    );

    const { stderr, stdout } = failure as {
      stderr?: unknown;
      stdout?: unknown;
    };

    const output =
      typeof stderr === "string" && stderr.length > 0
        ? stderr
        : typeof stdout === "string"
          ? stdout
          : undefined;

    if (typeof output !== "string") {
      throw new Error("expected failure output to be a string");
    }

    const includesFailurePrefix = /\[build] failed:/.test(output);
    assert.ok(
      includesFailurePrefix,
      "expected failure output to include build failure prefix",
    );
  } finally {
    await rm(tempTsconfigUrl, { recursive: true, force: true });
  }
});
