import test from "node:test";
import assert from "node:assert/strict";

import { Cat32 } from "../src/index.js";
import { stableStringify } from "../src/serialize.js";

test("Map with Date key serializes using ISO sentinel", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  const map = new Map([[date, "v"]]);

  const serialized = stableStringify(map);
  const expectedKey = `__date__:${date.toISOString()}`;

  assert.deepEqual(JSON.parse(serialized), { [expectedKey]: "v" });
});

test("Map with invalid Date key serializes using invalid sentinel", () => {
  const date = new Date(NaN);
  const map = new Map([[date, "v"]]);

  const serialized = stableStringify(map);
  const expectedKey = "__date__:invalid";

  assert.deepEqual(JSON.parse(serialized), { [expectedKey]: "v" });
});

test("Cat32.assign uses ISO sentinel for Map Date keys", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  const map = new Map([[date, "v"]]);

  const cat = new Cat32();
  const assignment = cat.assign(map);
  const serialized = stableStringify(map);
  const expectedKey = `__date__:${date.toISOString()}`;

  assert.equal(assignment.key, serialized);
  assert.deepEqual(JSON.parse(assignment.key), { [expectedKey]: "v" });
});

test("Cat32.assign uses invalid sentinel for Map invalid Date keys", () => {
  const date = new Date(NaN);
  const map = new Map([[date, "v"]]);

  const cat = new Cat32();
  const assignment = cat.assign(map);
  const serialized = stableStringify(map);
  const expectedKey = "__date__:invalid";

  assert.equal(assignment.key, serialized);
  assert.deepEqual(JSON.parse(assignment.key), { [expectedKey]: "v" });
});
