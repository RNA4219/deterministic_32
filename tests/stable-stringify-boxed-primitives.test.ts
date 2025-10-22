import test from "node:test";
import assert from "node:assert";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify distinguishes boxed primitive numbers", () => {
  const boxedOne = Object(1);
  const boxedTwo = Object(2);

  assert.ok(stableStringify(boxedOne) !== stableStringify(boxedTwo));
});

test("stableStringify treats boxed bigint like primitive bigint", () => {
  const primitiveOne = 1n;
  const primitiveNegative = -1n;

  assert.ok(
    stableStringify(Object(primitiveOne)) ===
      stableStringify(primitiveOne),
  );
  assert.ok(
    stableStringify(Object(primitiveNegative)) ===
      stableStringify(primitiveNegative),
  );
});

test("Cat32 assign key reflects boxed boolean value", () => {
  const cat = new Cat32();

  const trueAssignment = cat.assign(Object(true));
  const falseAssignment = cat.assign(Object(false));

  assert.ok(trueAssignment.key !== falseAssignment.key);
  assert.ok(trueAssignment.key === "true");
  assert.ok(falseAssignment.key === "false");
});
