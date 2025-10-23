import test from "node:test";
import assert from "node:assert/strict";
import { Cat32, stableStringify } from "../src/index.js";
test("Set は同内容の配列と異なる canonical key を生成する", () => {
    const cat = new Cat32();
    const entries = ["a", 1, { nested: true }];
    const arrayAssignment = cat.assign(entries);
    const setAssignment = cat.assign(new Set(entries));
    assert.ok(setAssignment.key !== arrayAssignment.key, "Set と配列は異なる canonical key であるべき");
    assert.ok(stableStringify(new Set(entries)) !== stableStringify(entries), "stableStringify も Set と配列で差分が必要");
});
