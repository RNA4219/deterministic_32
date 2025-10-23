import test from "node:test";
import assert from "node:assert";
import { Cat32, stableStringify } from "../src/index.js";
const sharedArrayBuffer = typeof SharedArrayBuffer === "function" ? new SharedArrayBuffer(4) : undefined;
test("stableStringify distinguishes typed array views with different bytes", () => {
    const left = new Uint16Array([0x0102, 0x0304]);
    const right = new Uint16Array([0x0102, 0x0305]);
    assert.ok(stableStringify(left) !== stableStringify(right));
});
test("Cat32 assign key differs for typed array views with different bytes", () => {
    const cat = new Cat32();
    const left = new Uint16Array([0x0102, 0x0304]);
    const right = new Uint16Array([0x0102, 0x0305]);
    const assignmentLeft = cat.assign(left);
    const assignmentRight = cat.assign(right);
    assert.ok(assignmentLeft.key !== assignmentRight.key);
    assert.ok(assignmentLeft.hash !== assignmentRight.hash);
});
test("Cat32 distinguish typed array views with same bytes but different view types", () => {
    const cat = new Cat32();
    const source = new ArrayBuffer(4);
    const asUint8 = new Uint8Array(source);
    const asUint16 = new Uint16Array(source);
    asUint8.set([1, 2, 3, 4]);
    const assignmentUint8 = cat.assign(asUint8);
    const assignmentUint16 = cat.assign(asUint16);
    assert.ok(assignmentUint8.key !== assignmentUint16.key);
    assert.ok(assignmentUint8.hash !== assignmentUint16.hash);
});
if (sharedArrayBuffer) {
    const buildShared = () => {
        const buffer = new SharedArrayBuffer(4);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < view.length; i += 1) {
            view[i] = i + 1;
        }
        return buffer;
    };
    test("stableStringify distinguishes SharedArrayBuffer instances by content", () => {
        const left = buildShared();
        const right = buildShared();
        const rightView = new Uint8Array(right);
        rightView[1] = 9;
        assert.ok(stableStringify(left) !== stableStringify(right));
    });
    test("Cat32 assign key differs for SharedArrayBuffers with different content", () => {
        const cat = new Cat32();
        const left = buildShared();
        const right = buildShared();
        const rightView = new Uint8Array(right);
        rightView[1] = 9;
        const assignmentLeft = cat.assign(left);
        const assignmentRight = cat.assign(right);
        assert.ok(assignmentLeft.key !== assignmentRight.key);
        assert.ok(assignmentLeft.hash !== assignmentRight.hash);
    });
}
