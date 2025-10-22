import test from "node:test";
import assert from "node:assert/strict";

import { stableStringify } from "../../src/serialize.js";

const SYMBOL_SENTINEL_PREFIX = "__symbol__:";

type LocalSymbolPayload = ["local", string, string];

type ParsedLocalSymbolSentinel = {
  identifier: string;
  description: string;
};

function parseLocalSymbolSentinel(serialized: string): ParsedLocalSymbolSentinel {
  const raw =
    serialized.startsWith("\"") && serialized.endsWith("\"")
      ? (JSON.parse(serialized) as unknown)
      : serialized;

  assert.equal(typeof raw, "string");
  const sentinel = raw as string;
  assert.ok(sentinel.startsWith(SYMBOL_SENTINEL_PREFIX));

  const payload = JSON.parse(
    sentinel.slice(SYMBOL_SENTINEL_PREFIX.length),
  ) as unknown;

  assert.ok(Array.isArray(payload));
  const [kind, identifier, description] = payload as LocalSymbolPayload;
  assert.equal(kind, "local");
  assert.equal(typeof identifier, "string");
  assert.equal(typeof description, "string");

  return { identifier, description };
}

test("stableStringify reuses local symbol sentinel identifiers", () => {
  const reusable = Symbol("reusable");

  const first = stableStringify(reusable);
  const second = stableStringify(reusable);

  assert.equal(first, second);

  const firstParsed = parseLocalSymbolSentinel(first);
  const firstIdentifierValue = parseInt(firstParsed.identifier, 36);
  assert.ok(Number.isFinite(firstIdentifierValue));

  const next = Symbol("next");
  const nextParsed = parseLocalSymbolSentinel(stableStringify(next));
  const nextIdentifierValue = parseInt(nextParsed.identifier, 36);
  assert.ok(Number.isFinite(nextIdentifierValue));

  assert.equal(nextIdentifierValue, firstIdentifierValue + 1);
});
