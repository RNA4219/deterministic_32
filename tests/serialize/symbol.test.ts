import test from "node:test";
import assert from "node:assert/strict";

import { stableStringify } from "../../src/serialize.js";

const SYMBOL_SENTINEL_PREFIX = "__symbol__:";
const SET_SENTINEL_PREFIX = "\u0000cat32:set:";
const SENTINEL_SUFFIX = "\u0000";

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

const HAS_WEAKREF = "WeakRef" in globalThis;
const HAS_FINALIZATION_REGISTRY = "FinalizationRegistry" in globalThis;

test(
  "stableStringify serializes identical local symbol twice with weak refs",
  () => {
    if (!HAS_WEAKREF || !HAS_FINALIZATION_REGISTRY) return;

    const serializable = Symbol("weak-local");

    stableStringify(serializable);
    stableStringify(serializable);
  },
);

test("Issue1: WeakRef 定義環境でローカルシンボルを複数回直列化できる", () => {
  if (!("WeakRef" in globalThis)) return;

  const symbol = Symbol("issue1:local");

  stableStringify(symbol);
  stableStringify(symbol);
  stableStringify(symbol);
});

test("stableStringify serializes symbols nested in sets", () => {
  const description = "within set";
  const serialized = stableStringify(new Set([Symbol(description)]));

  const sentinel = JSON.parse(serialized) as unknown;
  assert.equal(typeof sentinel, "string");

  const sentinelString = sentinel as string;
  assert.ok(sentinelString.startsWith(SET_SENTINEL_PREFIX));
  assert.ok(sentinelString.endsWith(SENTINEL_SUFFIX));

  const payloadJson = sentinelString.slice(
    SET_SENTINEL_PREFIX.length,
    -SENTINEL_SUFFIX.length,
  );
  const entries = JSON.parse(payloadJson) as unknown;
  assert.ok(Array.isArray(entries));
  const [entry] = entries as [unknown];
  assert.equal(typeof entry, "string");

  const { description: parsedDescription } = parseLocalSymbolSentinel(
    entry as string,
  );
  assert.equal(parsedDescription, description);
});
