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
    "TS2339: Property 'target' does not exist on type",
    "TS2322: Type 'LocalSymbolRegistryEntry' is not assignable to type 'SymbolObject'",
    "TS2345: Argument of type 'SymbolObject' is not assignable to parameter of type 'LocalSymbolRegistryEntry'",
    "TS2322: Type '__LocalSymbolRegistryEntryForTest' is not assignable to type '__SymbolObjectForTest'",
    "TS2345: Argument of type '__SymbolObjectForTest' is not assignable to parameter of type '__LocalSymbolRegistryEntryForTest'",
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

const createLocalSymbolRegistryEntryFixture = async (): Promise<
  () => Promise<void>
> => {
  const { fileURLToPath } = (await dynamicImport("node:url")) as {
    fileURLToPath: (input: URL) => string;
  };
  const { join } = (await dynamicImport("node:path")) as {
    join: (...segments: string[]) => string;
  };
  const { mkdir, rm, writeFile } = (await dynamicImport("node:fs/promises")) as {
    mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
    rm: (path: string, options: { force: boolean }) => Promise<void>;
    writeFile: (path: string, data: string) => Promise<void>;
  };

  const repoRootPath = fileURLToPath(repoRootUrl);
  const generatedDir = join(repoRootPath, "tests", "build", "__generated__");
  await mkdir(generatedDir, { recursive: true });

  const fixturePath = join(
    generatedDir,
    `local-symbol-registry-entry-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}.ts`,
  );

  const source = `import type {
  __LocalSymbolRegistryEntryForTest,
  __SymbolObjectForTest,
} from "../../../src/serialize.js";

type LocalSymbolRegistryEntry = __LocalSymbolRegistryEntryForTest;
type SymbolObject = __SymbolObjectForTest;

const registry: Map<symbol, LocalSymbolRegistryEntry> = new Map();

export const getOrCreateSymbolObject = (symbol: symbol): SymbolObject => {
  const existing = registry.get(symbol);
  if (existing !== undefined) {
    return existing.target;
  }

  const created = Object(symbol) as SymbolObject;
  registry.set(symbol, { target: created });
  return created;
};
`;

  await writeFile(fixturePath, source);

  return () => rm(fixturePath, { force: true });
};

test(
  "getOrCreateSymbolObject の戻り値が LocalSymbolRegistryEntry と互換である",
  async () => {
    const disposeFixture = await createLocalSymbolRegistryEntryFixture();
    let buildError: unknown;

    try {
      await runTsc("npm run build");
    } catch (error) {
      buildError = error;
    }

    await disposeFixture();

    if (buildError !== undefined) {
      const stderr =
        typeof buildError === "object" &&
        buildError !== null &&
        "stderr" in buildError &&
        typeof (buildError as { stderr?: unknown }).stderr === "string"
          ? (buildError as { stderr: string }).stderr
          : "";
      assertNoLocalSymbolRegistryErrors(stderr);
      throw buildError;
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
