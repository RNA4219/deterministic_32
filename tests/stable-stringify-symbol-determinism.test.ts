import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

const SYMBOL_SENTINEL_PREFIX = "__symbol__:";

type LocalSymbolPayload = ["local", string, string];

function parseLocalSymbolSentinel(serialized: string): LocalSymbolPayload {
  const raw =
    serialized.startsWith("\"") && serialized.endsWith("\"")
      ? (JSON.parse(serialized) as unknown)
      : serialized;

  assert.equal(typeof raw, "string");
  const sentinel = raw as string;
  assert.ok(sentinel.startsWith(SYMBOL_SENTINEL_PREFIX));

  const payloadJson = sentinel.slice(SYMBOL_SENTINEL_PREFIX.length);
  const payload = JSON.parse(payloadJson) as unknown;

  assert.ok(Array.isArray(payload));
  const tuple = payload as LocalSymbolPayload;
  assert.equal(tuple[0], "local");
  assert.equal(typeof tuple[1], "string");
  assert.equal(typeof tuple[2], "string");

  return tuple;
}

function expectDoesNotThrow<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

test("stableStringify reuses local symbol sentinel", () => {
  const symbol = Symbol("repeat");

  const first = expectDoesNotThrow(() => stableStringify(symbol));
  const second = expectDoesNotThrow(() => stableStringify(symbol));

  assert.equal(first, second);

  const [, identifier, description] = parseLocalSymbolSentinel(first);
  assert.ok(identifier.length > 0);
  assert.equal(description, "repeat");
});

test("Cat32.assign reuses local symbol sentinel for repeated inputs", () => {
  const cat = new Cat32();
  const symbol = Symbol("repeat");

  const first = expectDoesNotThrow(() => cat.assign(symbol));
  const second = expectDoesNotThrow(() => cat.assign(symbol));

  assert.equal(first.key, second.key);
  assert.equal(first.hash, second.hash);

  const [, identifier, description] = parseLocalSymbolSentinel(first.key);
  assert.ok(identifier.length > 0);
  assert.equal(description, "repeat");
});
