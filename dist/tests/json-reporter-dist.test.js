import assert from "node:assert/strict";
import test from "node:test";
const dynamicImport = new Function("specifier", "return import(specifier);");
const repoRootUrl = import.meta.url.includes("/dist/tests/")
    ? new URL("../..", import.meta.url)
    : new URL("..", import.meta.url);
const distJsonReporterUrl = new URL("dist/tests/json-reporter.js", repoRootUrl);
test("dist JSON reporter serializes SharedArrayBuffer as byte array", async () => {
    const module = (await dynamicImport(distJsonReporterUrl.href));
    const { toSerializableEvent } = module;
    const buffer = new SharedArrayBuffer(4);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4]);
    const event = { type: "data", data: buffer };
    const normalized = toSerializableEvent(event);
    assert.deepEqual(normalized, { type: "data", data: [1, 2, 3, 4] });
});
