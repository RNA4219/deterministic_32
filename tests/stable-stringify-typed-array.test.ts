import test from "node:test";
import assert from "node:assert";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify distinguishes typed array views by content", () => {
  const left = new Uint8Array([1, 2]);
  const right = new Uint8Array([1, 3]);

  assert.ok(stableStringify(left) !== stableStringify(right));
});

test("stableStringify distinguishes ArrayBuffer instances by content", () => {
  const left = new Uint8Array([1, 2]).buffer;
  const right = new Uint8Array([1, 3]).buffer;

  assert.ok(stableStringify(left) !== stableStringify(right));
});

test("Cat32 assign key differs for ArrayBuffers with different content", () => {
  const cat = new Cat32();
  const left = new Uint8Array([1, 2]).buffer;
  const right = new Uint8Array([1, 3]).buffer;

  const assignmentLeft = cat.assign(left);
  const assignmentRight = cat.assign(right);

  assert.ok(assignmentLeft.key !== assignmentRight.key);
  assert.ok(assignmentLeft.hash !== assignmentRight.hash);
});
