import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const repositoryRoot = import.meta.url.includes("/dist/tests/")
    ? new URL("../..", import.meta.url)
    : new URL("..", import.meta.url);
const releaseDrafterConfigUrl = new URL(".github/release-drafter.yml", repositoryRoot);
const releaseDrafterWorkflowUrl = new URL(".github/workflows/release-drafter.yml", repositoryRoot);
const testWorkflowUrl = new URL(".github/workflows/test.yml", repositoryRoot);
const tsconfigUrl = new URL("tsconfig.json", repositoryRoot);
const loadReadFile = async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
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
    assert.ok(/uses:\s*release-drafter\/release-drafter@v\d+(?:\.\d+)?/.test(workflowContent));
    assert.ok(/on:\s*\n\s*push:/.test(workflowContent));
});
test("test workflow runs lint", async () => {
    const readFile = await loadReadFile();
    const workflowContent = await readFile(testWorkflowUrl, "utf8");
    assert.ok(/npm run lint/.test(workflowContent));
});
test("typecheck job runs lint before building", async () => {
    const readFile = await loadReadFile();
    const workflowContent = await readFile(testWorkflowUrl, "utf8");
    const typecheckJobMatch = workflowContent.match(/  typecheck:\n((?: {4}.+\n)+)/);
    assert.ok(typecheckJobMatch, "typecheck job is not defined");
    const [, typecheckJobContent] = typecheckJobMatch;
    assert.ok(/run: npm run lint/.test(typecheckJobContent));
    const lintIndex = typecheckJobContent.indexOf("run: npm run lint");
    const buildIndex = typecheckJobContent.indexOf("npm run build");
    assert.ok(lintIndex !== -1, "lint step is missing in the typecheck job");
    assert.ok(buildIndex !== -1, "build step is missing in the typecheck job");
    assert.ok(lintIndex < buildIndex, "lint should run before the build step");
});
test("JSON reporter runner covers frontend tests", async () => {
    const readFile = await loadReadFile();
    const runnerUrl = new URL("--test-reporter=json", repositoryRoot);
    const runnerContent = await readFile(runnerUrl, "utf8");
    assert.ok(runnerContent.includes("dist/frontend/tests"), "frontend test suite must be executed by JSON reporter runner");
});
test("tsconfig exposes DOM lib for service worker Request types", async () => {
    const readFile = await loadReadFile();
    const tsconfigContent = await readFile(tsconfigUrl, "utf8");
    const config = JSON.parse(tsconfigContent);
    const libs = config.compilerOptions?.lib;
    assert.ok(Array.isArray(libs), "tsconfig compilerOptions.lib must be defined");
    const normalized = libs.map((lib) => String(lib).toLowerCase());
    assert.ok(normalized.includes("dom"), "tsconfig must include the DOM lib to provide Request typings");
});
