import test from "node:test";
import assert from "node:assert";

import { Cat32 } from "../src/index.js";
import { stableStringify } from "../src/serialize.js";

test("Map with Date key serializes using ISO sentinel", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  const map = new Map([[date, "v"]]);

  const serialized = stableStringify(map);
  const parsed = JSON.parse(serialized) as Record<string, string>;
  const keys = Object.keys(parsed);
  const expectedKey = `__date__:${date.toISOString()}`;

  assert.equal(keys.length, 1);
  assert.equal(keys[0], expectedKey);
  assert.equal(parsed[expectedKey], "v");
});

test("Cat32.assign uses ISO sentinel for Map Date keys", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  const map = new Map([[date, "v"]]);

  const cat = new Cat32();
  const assignment = cat.assign(map);
  const serialized = stableStringify(map);

  assert.equal(assignment.key, serialized);
  assert.ok(assignment.key.includes(date.toISOString()));
});
