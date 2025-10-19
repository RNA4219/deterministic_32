import assert from "node:assert/strict";
const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

type NodeTestModule = {
  readonly default: (name: string, fn: () => Promise<void>) => Promise<void>;
};

const { default: runTest } = (await dynamicImport("node:test")) as NodeTestModule;

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
};

runTest(
  "scripts/run-tests.js は絶対パスの .ts 引数を dist の .js へ変換する",
  async () => {
    const spawnCalls: SpawnCall[] = [];
    const { fileURLToPath, pathToFileURL } = (await dynamicImport("node:url")) as {
      fileURLToPath(input: URL): string;
      pathToFileURL(input: string): URL;
    };
    const { cwd } = process as unknown as { cwd: () => string };
    const repoRootUrl = pathToFileURL(`${cwd()}/`);
    const scriptUrl = new URL("scripts/run-tests.js", repoRootUrl);
    const absoluteArgumentPath = fileURLToPath(new URL("tests/json-reporter.test.ts", repoRootUrl));
    const scriptPath = fileURLToPath(scriptUrl);
    const argv0 = process.argv[0] ?? "";

    type SpawnImplementation = (
      command: string,
      args: readonly string[],
      options: unknown,
    ) => { on: (...args: unknown[]) => unknown };

    type SpawnTestProcess = (
      argv?: readonly string[],
      execPath?: string,
      spawnImplementation?: SpawnImplementation,
    ) => { on: (...args: unknown[]) => unknown };

    const { spawnTestProcess } = (await dynamicImport(scriptUrl.href)) as {
      spawnTestProcess: SpawnTestProcess;
    };

    const spawnImplementation: SpawnImplementation = (
      command,
      args,
      options,
    ) => {
      spawnCalls.push({ command, args: [...args] });
      return {
        on() {
          return this;
        },
      };
    };

    const { execPath } = process as unknown as { execPath: string };

    spawnTestProcess([argv0, scriptPath, absoluteArgumentPath], execPath, spawnImplementation);

    assert.equal(spawnCalls.length, 1, "spawn は 1 回呼び出される想定");

    const [{ command, args }] = spawnCalls;

    const { join } = (await dynamicImport("node:path")) as { join: (...segments: string[]) => string };

    assert.equal(command, execPath, "node 実行ファイルが利用される想定");
    assert.deepEqual(
      args,
      [
        "--test",
        "dist/tests",
        "dist/frontend/tests",
        join("dist", "tests", "json-reporter.test.js"),
      ],
      "絶対パスの .ts が dist 下の .js へ正規化される想定",
    );
  },
);
