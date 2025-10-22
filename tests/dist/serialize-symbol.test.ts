import test from "node:test";
import assert from "node:assert/strict";

test("dist の stableStringify は Symbol をシリアライズできる", async () => {
  const relative = import.meta.url.includes("/dist/tests/")
    ? "../../../dist/serialize.js"
    : "../../dist/serialize.js";
  const { stableStringify } = await import(new URL(relative, import.meta.url).href);

  const symbol = Symbol("foo");

  const serialized = stableStringify(symbol);
  assert.equal(typeof serialized, "string");

  const parsed = JSON.parse(serialized);
  assert.equal(typeof parsed, "string");
  assert.ok(parsed.startsWith("__symbol__:"));

  const serializedAgain = stableStringify(symbol);
  assert.equal(serializedAgain, serialized);
});
