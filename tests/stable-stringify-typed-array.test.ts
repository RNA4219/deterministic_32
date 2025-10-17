import test from "node:test";
import assert from "node:assert";

import { Cat32, stableStringify } from "../src/index.js";

test("Cat32 assign key matches JSON.stringify for typed array views", () => {
  const value = new Uint8Array([1, 2]);
  const assignment = new Cat32().assign(value);
  assert.equal(assignment.key, JSON.stringify(String(value)));
});

test("Cat32 assign key matches JSON.stringify for ArrayBuffer", () => {
  const value = new ArrayBuffer(4);
  const assignment = new Cat32().assign(value);
  assert.equal(assignment.key, JSON.stringify(String(value)));
});

test("stableStringify matches JSON.stringify for typed array views", () => {
  const value = new Uint8Array([1, 2]);
  assert.equal(stableStringify(value), JSON.stringify(String(value)));
});

test("stableStringify matches JSON.stringify for ArrayBuffer", () => {
  const value = new ArrayBuffer(4);
  assert.equal(stableStringify(value), JSON.stringify(String(value)));
});
