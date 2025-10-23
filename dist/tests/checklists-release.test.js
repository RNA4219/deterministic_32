import test from "node:test";
import assert from "node:assert";
const dynamicImport = new Function("specifier", "return import(specifier);");
const repositoryRoot = import.meta.url.includes("/dist/tests/")
    ? new URL("../..", import.meta.url)
    : new URL("..", import.meta.url);
const checklistUrl = new URL("workflow-cookbook-main/CHECKLISTS.md", repositoryRoot);
const loadReadFile = async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    return readFile;
};
test("release checklist enforces env/config diff review", async () => {
    const readFile = await loadReadFile();
    const content = await readFile(checklistUrl, "utf8");
    const releaseSectionMatch = content.match(/## Release\n+((?:- .+\n)+)/u);
    assert.ok(releaseSectionMatch, "Release section must exist in checklist");
    const [, releaseSectionContent] = releaseSectionMatch;
    assert.ok(/- \S*(?:環境変数|設定)\S*差分\S*レビュー\S*/u.test(releaseSectionContent), "Release checklist must require reviewing env/config diffs");
});
