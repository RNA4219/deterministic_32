import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify distinguishes RegExp variants", () => {
  const foo = stableStringify(/foo/);
  const fooIgnoreCase = stableStringify(/foo/i);
  const fooGlobal = stableStringify(new RegExp("foo", "g"));
  const emptyObject = stableStringify({});

  assert.ok(foo !== fooIgnoreCase);
  assert.ok(foo !== fooGlobal);
  assert.ok(fooIgnoreCase !== fooGlobal);

  assert.ok(foo !== emptyObject);
  assert.ok(fooIgnoreCase !== emptyObject);
  assert.ok(fooGlobal !== emptyObject);

  assert.ok(JSON.parse(foo).startsWith("\u0000cat32:regexp:"));
  assert.ok(JSON.parse(fooIgnoreCase).startsWith("\u0000cat32:regexp:"));
  assert.ok(JSON.parse(fooGlobal).startsWith("\u0000cat32:regexp:"));
});

test("Cat32.assign produces distinct keys and hashes for RegExp variants", () => {
  const cat = new Cat32();

  const foo = cat.assign(/foo/);
  const fooIgnoreCase = cat.assign(/foo/i);
  const emptyObject = cat.assign({});

  assert.ok(foo.key !== fooIgnoreCase.key);
  assert.ok(foo.hash !== fooIgnoreCase.hash);
  assert.ok(foo.key !== emptyObject.key);
  assert.ok(foo.hash !== emptyObject.hash);
  assert.ok(fooIgnoreCase.key !== emptyObject.key);
  assert.ok(fooIgnoreCase.hash !== emptyObject.hash);
});

test("stableStringify Map buckets RegExp keys without collisions", () => {
  const map = new Map<unknown, string>([
    [/foo/, "a"],
    [/foo/i, "b"],
    [{}, "c"],
  ]);

  const serialized = stableStringify(map);
  const parsed = JSON.parse(serialized) as Record<string, string>;
  const keys = Object.keys(parsed);
  const regexKeys = keys.filter((key) => key.startsWith("\u0000cat32:regexp:"));

  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
  assert.equal(regexKeys.length, 2);
  assert.equal(new Set(regexKeys).size, 2);
  assert.deepStrictEqual(regexKeys.map((key) => parsed[key]).sort(), ["a", "b"]);
});
