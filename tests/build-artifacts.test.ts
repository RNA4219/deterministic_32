import assert from "node:assert";
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

  const { env: baseEnv = {}, platform = "linux" } = (process as unknown as ProcessLike) ?? {};
  const npmExecutable = platform === "win32" ? "npm.cmd" : "npm";
  const env = { ...baseEnv, CI: "1" };

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        npmExecutable,
        ["run", "build"],
        { cwd: repoRootPath, env },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });

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
