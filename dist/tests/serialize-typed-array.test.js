import test from "node:test";
import assert from "node:assert";
import { Cat32, stableStringify } from "../src/index.js";
const typedArray = new Uint8Array([10, 20, 30]);
const sharedArrayBuffer = typeof SharedArrayBuffer === "function" ? new SharedArrayBuffer(4) : undefined;
if (sharedArrayBuffer) {
    const sharedView = new Uint8Array(sharedArrayBuffer);
    for (let i = 0; i < sharedView.length; i += 1) {
        sharedView[i] = i + 1;
    }
}
test("stableStringify of Uint8Array matches JSON string of its String coercion", () => {
    const value = new Uint8Array(typedArray);
    assert.equal(stableStringify(value), JSON.stringify(String(value)));
});
test("Cat32.assign key for Uint8Array matches JSON string of its String coercion", () => {
    const value = new Uint8Array(typedArray);
    const assignment = new Cat32().assign(value);
    assert.equal(assignment.key, JSON.stringify(String(value)));
});
if (sharedArrayBuffer) {
    test("stableStringify of SharedArrayBuffer view matches JSON string of its String coercion", () => {
        const view = new Uint8Array(sharedArrayBuffer);
        assert.equal(stableStringify(view), JSON.stringify(String(view)));
    });
    test("Cat32.assign key for SharedArrayBuffer view matches JSON string of its String coercion", () => {
        const view = new Uint8Array(sharedArrayBuffer);
        const assignment = new Cat32().assign(view);
        assert.equal(assignment.key, JSON.stringify(String(view)));
    });
}
