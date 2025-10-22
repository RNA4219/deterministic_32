import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify reuses local symbol sentinel", () => {
  const symbol = Symbol("repeat");

  const first = stableStringify(symbol);
  const second = stableStringify(symbol);

  assert.equal(first, second);
});

test("Cat32.assign reuses local symbol sentinel for repeated inputs", () => {
  const cat = new Cat32();
  const symbol = Symbol("repeat");

  const first = cat.assign(symbol);
  const second = cat.assign(symbol);

  assert.equal(first.key, second.key);
  assert.equal(first.hash, second.hash);
});
