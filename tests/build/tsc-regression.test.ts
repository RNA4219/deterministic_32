import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const repoRootUrl = new URL("../../..", import.meta.url);

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

const runTsc = async (
  command: "npm run build",
): Promise<{ stdout: string; stderr: string }> => {
  const { execFile } = (await dynamicImport("node:child_process")) as { execFile: ExecFile };
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };

  const repoRootPath = fileURLToPath(repoRootUrl);
  const env = { ...baseEnv, CI: "1" };

  const [file, ...args] = (() => {
    switch (command) {
      case "npm run build":
        return [getNpmExecutable(), "run", "build"] as const;
    }
  })();

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: repoRootPath, env },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error ?? {}, { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
};

test("npm run build succeeds without TypeScript errors", async () => {
  await runTsc("npm run build");
});

const assertNoLocalSymbolRegistryErrors = (stderr: string): void => {
  for (const identifier of [
    "LOCAL_SYMBOL_OBJECT_REGISTRY",
    "LOCAL_SYMBOL_HOLDER_REGISTRY",
    "LOCAL_SYMBOL_IDENTIFIER_INDEX",
    "LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER",
    "getOrCreateSymbolObject",
    "peekLocalSymbolSentinelRecordFromObject",
  ] as const) {
    assert.ok(
      !stderr.includes(`TS2304: Cannot find name '${identifier}'`),
      `${identifier} が未定義として報告されている`,
    );
  }

  for (const diagnostic of [
    "TS2339: Property 'finalizerToken' does not exist on type",
    "TS2322: Type 'LocalSymbolRegistryEntry' is not assignable to type 'SymbolObject'",
    "TS2345: Argument of type 'SymbolObject' is not assignable to parameter of type 'LocalSymbolRegistryEntry'",
    "TS2552: Cannot find name 'getExistingLocalSymbolHolder'",
    "TS2552: Cannot find name 'LOCAL_SYMBOL_HOLDER_REGISTRY'",
    "TS2552: Cannot find name 'LOCAL_SYMBOL_IDENTIFIER_INDEX'",
    "TS2552: Cannot find name 'LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER'",
    "TS2304: Cannot find name 'isWeakRegistryEntry'",
  ]) {
    assert.ok(
      !stderr.includes(diagnostic),
      `${diagnostic} が出力されている`,
    );
  }
};

test(
  "npm run build が Local Symbol Registry 関連の TS2304 エラーを報告しない",
  async () => {
    try {
      const { stderr } = await runTsc("npm run build");
      assertNoLocalSymbolRegistryErrors(stderr);
    } catch (error) {
      assertNoLocalSymbolRegistryErrors(
        typeof error === "object" &&
          error !== null &&
          "stderr" in error &&
          typeof (error as { stderr?: unknown }).stderr === "string"
          ? (error as { stderr: string }).stderr
          : "",
      );
      throw error;
    }
  },
);

const readFileFromRepoRoot = async (relativePath: string): Promise<string> => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };
  const { join } = (await dynamicImport("node:path")) as {
    join: (...segments: string[]) => string;
  };
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile: (path: string, encoding: string) => Promise<string>;
  };

  const repoRootPath = fileURLToPath(repoRootUrl);
  return readFile(join(repoRootPath, relativePath), "utf8");
};

test(
  "npm run build 後の dist/categorizer.d.ts が NFD/NFKD を含む",
  async () => {
    let buildError: unknown;
    try {
      await runTsc("npm run build");
    } catch (error) {
      buildError = error;
    }

    const declaration = await readFileFromRepoRoot("dist/categorizer.d.ts");
    assert.ok(
      declaration.includes("| \"nfd\""),
      'dist/categorizer.d.ts に "| \\"nfd\\"" が含まれていません',
    );
    assert.ok(
      declaration.includes("| \"nfkd\""),
      'dist/categorizer.d.ts に "| \\"nfkd\\"" が含まれていません',
    );

    if (buildError !== undefined) {
      throw buildError;
    }
  },
);
