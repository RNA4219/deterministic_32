import assert from "node:assert/strict";
import test from "node:test";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const repoRootUrl = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);
const runnerUrl = new URL("--test-reporter=json", repoRootUrl);

const nodeProcess = process as unknown as {
  readonly argv: readonly string[];
  cwd(): string;
  readonly execPath: string;
};

test("prepareRunnerOptions expands TS targets to dist JS paths", async () => {
  const module = (await dynamicImport(runnerUrl.href)) as {
    readonly prepareRunnerOptions: (
      argv: readonly string[],
      cwd: string,
    ) => { readonly args: readonly string[] };
  };

  const result = module.prepareRunnerOptions(
    [nodeProcess.argv[0]!, "./--test-reporter=json", "tests/categorizer.test.ts"],
    nodeProcess.cwd(),
  );

  assert.ok(result.args.includes("dist/tests/categorizer.test.js"));
  assert.ok(!result.args.includes("tests/categorizer.test.ts"));
});

test("prepareRunnerOptions prioritizes --test-reporter-destination flag", async () => {
  const module = (await dynamicImport(runnerUrl.href)) as {
    readonly prepareRunnerOptions: (
      argv: readonly string[],
      cwd: string,
    ) => { readonly args: readonly string[]; readonly destination: string };
  };

  const { resolve } = (await dynamicImport("node:path")) as {
    resolve: (cwd: string, path: string) => string;
  };

  const cwd = nodeProcess.cwd();
  const result = module.prepareRunnerOptions(
    ["node", "script", "--test-reporter-destination=tmp/out.jsonl"],
    cwd,
  );

  assert.equal(result.destination, "tmp/out.jsonl");
  assert.ok(
    result.args.includes(
      `--test-reporter-destination=${resolve(cwd, "tmp/out.jsonl")}`,
    ),
  );
});

test("prepareRunnerOptions default behavior snapshot", async () => {
  const module = (await dynamicImport(runnerUrl.href)) as {
    readonly prepareRunnerOptions: (
      argv: readonly string[],
      cwd: string,
    ) => {
      readonly command: string;
      readonly args: readonly string[];
      readonly destination: string;
      readonly resolvedDestination: string;
      readonly options: {
        readonly stdio?: unknown;
        readonly env?: Record<string, unknown> | undefined;
      };
    };
  };

  const { basename, relative } = (await dynamicImport("node:path")) as {
    basename: (value: string) => string;
    relative: (from: string, to: string) => string;
  };

  const cwd = nodeProcess.cwd();
  const result = module.prepareRunnerOptions(["node", "script"], cwd);

  const sanitized = {
    command: basename(result.command),
    destination: result.destination,
    resolvedDestination: relative(cwd, result.resolvedDestination),
    args: result.args.map((argument) => {
      if (argument.startsWith("--test-reporter=")) {
        return "--test-reporter=<json-reporter>";
      }
      if (argument.startsWith("--test-reporter-destination=")) {
        const value = argument.slice("--test-reporter-destination=".length);
        return `--test-reporter-destination=${relative(cwd, value)}`;
      }
      return argument;
    }),
    options: {
      stdio: result.options.stdio,
      hasNodeTestContext: Boolean(result.options.env?.NODE_TEST_CONTEXT),
    },
  };

  assert.deepEqual(sanitized, {
    command: basename(nodeProcess.execPath),
    destination: "logs/test.jsonl",
    resolvedDestination: "logs/test.jsonl",
    args: [
      "--test",
      "--test-reporter=<json-reporter>",
      "--test-reporter-destination=logs/test.jsonl",
      "dist/tests",
      "dist/frontend/tests",
    ],
    options: {
      stdio: "inherit",
      hasNodeTestContext: false,
    },
  });
});
