import assert from "node:assert/strict";
import test from "node:test";

type PrepareRunnerOptions = (
  argv: readonly string[],
  overrides?: {
    existsSync?: (candidate: string) => boolean;
  },
) => {
  passthroughArgs: string[];
  targets: string[];
};

const repoRootUrl = import.meta.url.includes("/dist/")
  ? new URL("..", import.meta.url)
  : new URL(".", import.meta.url);
const runnerUrl = new URL("--test-reporter=json", repoRootUrl);

const loadPrepareRunnerOptions = async (): Promise<PrepareRunnerOptions> => {
  const processWithEnv = process as typeof process & {
    env: Record<string, string | undefined> & {
      __CAT32_SKIP_JSON_REPORTER_RUN__?: string;
    };
  };
  const previousSkip = processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
  processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = "1";

  try {
    const moduleExports = (await import(
      `${runnerUrl.href}?double-dash=${Date.now()}`,
    )) as { prepareRunnerOptions?: PrepareRunnerOptions };

    if (typeof moduleExports.prepareRunnerOptions !== "function") {
      throw new Error("prepareRunnerOptions not loaded");
    }

    return moduleExports.prepareRunnerOptions;
  } finally {
    if (previousSkip === undefined) {
      delete processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__;
    } else {
      processWithEnv.env.__CAT32_SKIP_JSON_REPORTER_RUN__ = previousSkip;
    }
  }
};

test(
  "prepareRunnerOptions resolves targets following double dash sentinel",
  async () => {
    const prepareRunnerOptions = await loadPrepareRunnerOptions();

    const result = prepareRunnerOptions(
      ["node", "script", "--", "--edge-case.test.ts"],
      {
        existsSync: (candidate) =>
          typeof candidate === "string" &&
          (candidate.endsWith("--edge-case.test.ts") ||
            candidate.endsWith("dist/--edge-case.test.js")),
      },
    );

    assert.deepEqual(result.passthroughArgs, ["--"]);
    assert.deepEqual(result.targets, ["dist/--edge-case.test.js"]);
  },
);
