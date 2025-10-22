import test from "node:test";
import assert from "node:assert/strict";

import { stableStringify } from "../../src/serialize.js";

const SYMBOL_SENTINEL_PREFIX = "__symbol__:";

const HAS_WEAK_REF = "WeakRef" in globalThis;
const HAS_FINALIZATION_REGISTRY = "FinalizationRegistry" in globalThis;

test("stableStringify serializes local symbols with finalization registry", () => {
  if (!HAS_WEAK_REF || !HAS_FINALIZATION_REGISTRY) {
    return;
  }

  const localSymbol = Symbol("finalization-local");

  const serialized = stableStringify(localSymbol);

  const sentinel = JSON.parse(serialized) as unknown;
  assert.equal(typeof sentinel, "string");
  assert.ok((sentinel as string).startsWith(SYMBOL_SENTINEL_PREFIX));
});
