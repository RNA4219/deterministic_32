import test from "node:test";
import assert from "node:assert";
const typedArray = new Uint8Array([1, 2, 3]);
const hasSharedArrayBuffer = typeof SharedArrayBuffer === "function";
async function loadStableStringify() {
    const moduleUrl = new URL("../../dist/serialize.js", import.meta.url);
    const module = await import(moduleUrl.href);
    return module.stableStringify;
}
test("stableStringify matches JSON stringified String(value) for TypedArray", async () => {
    const stableStringify = await loadStableStringify();
    const value = new Uint8Array(typedArray);
    assert.equal(stableStringify(value), JSON.stringify(String(value)));
});
test("stableStringify matches JSON stringified String(value) for ArrayBuffer", async () => {
    const stableStringify = await loadStableStringify();
    const value = typedArray.buffer.slice(0);
    assert.equal(stableStringify(value), JSON.stringify(String(value)));
});
if (hasSharedArrayBuffer) {
    test("stableStringify matches JSON stringified String(value) for SharedArrayBuffer views", async () => {
        const stableStringify = await loadStableStringify();
        const shared = new SharedArrayBuffer(typedArray.byteLength);
        const view = new Uint8Array(shared);
        view.set(typedArray);
        assert.equal(stableStringify(view), JSON.stringify(String(view)));
    });
}
