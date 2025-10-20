import test from "node:test";
import assert from "node:assert";

import { stableStringify } from "../src/serialize.js";

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
});
