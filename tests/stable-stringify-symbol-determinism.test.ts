import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify reuses local symbol sentinel", () => {
  const symbol = Symbol("repeat");

  const values: string[] = [];

  values.push(stableStringify(symbol));
  values.push(stableStringify(symbol));

  const [first, second] = values;

  assert.equal(first, second);
});

test("Cat32.assign reuses local symbol sentinel for repeated inputs", () => {
  const cat = new Cat32();
  const symbol = Symbol("repeat");

  const assignments = [] as ReturnType<Cat32["assign"]>[];

  assignments.push(cat.assign(symbol));
  assignments.push(cat.assign(symbol));

  const [first, second] = assignments;

  assert.equal(first.key, second.key);
  assert.equal(first.hash, second.hash);
});
