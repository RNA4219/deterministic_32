import assert from "node:assert";
import test from "node:test";

test("json reporter specifier resolves", async () => {
  // @ts-expect-error Custom reporter module is provisioned at build time.
  const module = await import("json");
  assert.equal(typeof module.default, "function");
});
