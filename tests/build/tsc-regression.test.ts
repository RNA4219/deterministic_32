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

const { env: baseEnv = {}, platform = "linux" } = (process as unknown as ProcessLike) ?? {};

const getNpmExecutable = (): string => (platform === "win32" ? "npm.cmd" : "npm");

const runTsc = async (command: "npm run build"): Promise<void> => {
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

  await new Promise<void>((resolve, reject) => {
    execFile(
      file,
      args,
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
};

test("npm run build succeeds without TypeScript errors", async () => {
  await runTsc("npm run build");
});
