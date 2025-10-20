import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify unwraps boxed primitive numbers", () => {
  const boxedOne = Object(1);
  const boxedTwo = Object(2);

  assert.equal(stableStringify(boxedOne), stableStringify(1));
  assert.equal(stableStringify(boxedTwo), stableStringify(2));
  assert.ok(stableStringify(boxedOne) !== stableStringify(boxedTwo));
});

test("stableStringify unwraps boxed primitive booleans", () => {
  const boxedTrue = Object(true);
  const boxedFalse = Object(false);

  assert.equal(stableStringify(boxedTrue), stableStringify(true));
  assert.equal(stableStringify(boxedFalse), stableStringify(false));
  assert.ok(stableStringify(boxedTrue) !== stableStringify(boxedFalse));
});

test("stableStringify unwraps boxed primitive bigints", () => {
  const boxedOne = Object(1n);
  const boxedTwo = Object(2n);

  assert.equal(stableStringify(boxedOne), stableStringify(1n));
  assert.equal(stableStringify(boxedTwo), stableStringify(2n));
  assert.ok(stableStringify(boxedOne) !== stableStringify(boxedTwo));
});

test("Cat32 assign key reflects boxed boolean value", () => {
  const cat = new Cat32();

  const trueAssignment = cat.assign(Object(true));
  const falseAssignment = cat.assign(Object(false));

  assert.equal(trueAssignment.key, cat.assign(true).key);
  assert.equal(falseAssignment.key, cat.assign(false).key);
  assert.ok(trueAssignment.key !== falseAssignment.key);
});
