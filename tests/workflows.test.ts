import test from "node:test";
import assert from "node:assert";

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const repositoryRoot = import.meta.url.includes("/dist/tests/")
  ? new URL("../..", import.meta.url)
  : new URL("..", import.meta.url);

const releaseDrafterConfigUrl = new URL(
  ".github/release-drafter.yml",
  repositoryRoot,
);

const releaseDrafterWorkflowUrl = new URL(
  ".github/workflows/release-drafter.yml",
  repositoryRoot,
);

const testWorkflowUrl = new URL(
  ".github/workflows/test.yml",
  repositoryRoot,
);

type ReadFile = (path: URL, options: "utf8") => Promise<string>;

const loadReadFile = async (): Promise<ReadFile> => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as {
    readFile: ReadFile;
  };
  return readFile;
};

test("release drafter configuration exists with required keys", async () => {
  const readFile = await loadReadFile();
  const configContent = await readFile(releaseDrafterConfigUrl, "utf8");

  assert.ok(/name-template:\s*.+/.test(configContent));
  assert.ok(/tag-template:\s*.+/.test(configContent));
  assert.ok(/categories:\s*\n/.test(configContent));
});

test("release drafter workflow runs the release drafter action", async () => {
  const readFile = await loadReadFile();
  const workflowContent = await readFile(releaseDrafterWorkflowUrl, "utf8");

  assert.ok(
    /uses:\s*release-drafter\/release-drafter@v\d+(?:\.\d+)?/.test(
      workflowContent,
    ),
  );
  assert.ok(/on:\s*\n\s*push:/.test(workflowContent));
});

test("test workflow runs lint", async () => {
  const readFile = await loadReadFile();
  const workflowContent = await readFile(testWorkflowUrl, "utf8");

  assert.ok(/npm run lint/.test(workflowContent));
});
