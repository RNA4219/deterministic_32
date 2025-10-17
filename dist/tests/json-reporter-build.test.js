import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const repoRootUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../..", import.meta.url)
    : new URL("..", import.meta.url);
const distJsonReporterUrl = new URL("dist/tests/json-reporter.js", repoRootUrl);
const FINALLY_PATTERN = /\bfinally\b/;
const SEEN_DELETE_PATTERN = /seen\.delete\(value\)/;
test("dist JSON reporter removes seen references after normalization", async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const source = await readFile(distJsonReporterUrl, "utf8");
    assert.ok(FINALLY_PATTERN.test(source), "expected finally block to be emitted");
    assert.ok(SEEN_DELETE_PATTERN.test(source), "expected seen.delete(value) to be emitted");
});
