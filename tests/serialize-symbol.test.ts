import test from "node:test";
import assert from "node:assert/strict";

import { stableStringify } from "../src/serialize.js";

const MAP_SENTINEL_PREFIX = "\u0000cat32:map:";
const MAP_ENTRY_INDEX_SENTINEL_PREFIX = "\u0000cat32:map-entry-index:";
const SENTINEL_SUFFIX = "\u0000";

type MapSentinelEntries = Array<[string, string]>;
type MapEntryIndexPayload = [string, string, number];

function decodeMapSentinel(serialized: string): MapSentinelEntries {
  const sentinel = JSON.parse(serialized);
  assert.equal(typeof sentinel, "string");
  assert.ok(
    sentinel.startsWith(MAP_SENTINEL_PREFIX) &&
      sentinel.endsWith(SENTINEL_SUFFIX),
  );
  const payload = sentinel.slice(
    MAP_SENTINEL_PREFIX.length,
    -SENTINEL_SUFFIX.length,
  );
  return JSON.parse(payload) as MapSentinelEntries;
}

function decodeMapEntryPropertyKey(propertyKey: string): string {
  if (
    propertyKey.startsWith(MAP_ENTRY_INDEX_SENTINEL_PREFIX) &&
    propertyKey.endsWith(SENTINEL_SUFFIX)
  ) {
    const payload = propertyKey.slice(
      MAP_ENTRY_INDEX_SENTINEL_PREFIX.length,
      -SENTINEL_SUFFIX.length,
    );
    const [, symbolSentinel, index] = JSON.parse(
      payload,
    ) as MapEntryIndexPayload;
    assert.equal(index, 0);
    return symbolSentinel;
  }
  return propertyKey;
}

test(
  "stableStringify handles local symbol sentinel reuse for map keys",
  () => {
    const localSymbol = Symbol("map-key");
    const symbolSerialized = stableStringify(localSymbol);
    const symbolSentinel = JSON.parse(symbolSerialized);

    assert.equal(typeof symbolSentinel, "string");
    assert.ok(symbolSentinel.startsWith("__symbol__:"));

    const map = new Map([[localSymbol, "value"]]);
    const mapSerialized = stableStringify(map);
    const entries = decodeMapSentinel(mapSerialized);

    assert.equal(entries.length, 1);
    const [propertyKey, valueSerialized] = entries[0]!;

    assert.equal(
      decodeMapEntryPropertyKey(propertyKey),
      symbolSentinel,
    );
    assert.equal(JSON.parse(valueSerialized), "value");
    assert.equal(stableStringify(localSymbol), symbolSerialized);
  },
);

test(
  "stableStringify reuses local symbol sentinel across serializations",
  () => {
    const symbol = Symbol("repeat");
    const first = stableStringify(symbol);
    const firstSentinel = JSON.parse(first);

    assert.equal(typeof firstSentinel, "string");
    assert.ok(firstSentinel.startsWith("__symbol__:"));

    for (let index = 0; index < 5; index += 1) {
      const serialized = stableStringify(symbol);
      assert.equal(serialized, first);
    }
  },
);

test(
  "stableStringify allows local symbol sentinel re-registration after GC",
  async () => {
    if (typeof WeakRef !== "function" || typeof FinalizationRegistry !== "function") {
      return;
    }

    const originalFinalizationRegistry = FinalizationRegistry;
    type RegisteredEntry = {
      target: object;
      heldValue: unknown;
      token: unknown;
    };
    const registered: RegisteredEntry[] = [];
    let registryInstance: TestFinalizationRegistry | null = null;

    class TestFinalizationRegistry {
      #callback: (heldValue: unknown) => void;

      constructor(callback: (heldValue: unknown) => void) {
        this.#callback = callback;
        registryInstance = this;
      }

      register(target: object, heldValue: unknown, token?: unknown): void {
        registered.push({ target, heldValue, token: token ?? null });
      }

      unregister(token: unknown): boolean {
        let removed = false;
        for (let index = registered.length - 1; index >= 0; index -= 1) {
          if (registered[index]!.token === token) {
            registered.splice(index, 1);
            removed = true;
          }
        }
        return removed;
      }

      cleanup(): void {
        const entries = registered.splice(0, registered.length);
        for (const entry of entries) {
          this.#callback(entry.heldValue);
        }
      }
    }

    globalThis.FinalizationRegistry = TestFinalizationRegistry as unknown as typeof FinalizationRegistry;

    const moduleUrl = new URL(
      `../src/serialize.js?gc-test=${Date.now()}`,
      import.meta.url,
    ).href;
    const module = await import(moduleUrl);

    try {
      const {
        stableStringify: localStableStringify,
        __peekLocalSymbolSentinelRecordForTest,
      } = module as typeof import("../src/serialize.js");

      const symbol = Symbol("gc-reuse");
      const map = new Map([[symbol, "value"]]);
      const firstSerialized = localStableStringify(map);

      assert.equal(typeof firstSerialized, "string");
      assert.ok(registryInstance !== null);
      assert.ok(registered.length > 0);
      assert.ok(__peekLocalSymbolSentinelRecordForTest(symbol) !== undefined);

      registryInstance!.cleanup();

      assert.equal(__peekLocalSymbolSentinelRecordForTest(symbol), undefined);

      const secondMap = new Map([[symbol, "next"]]);
      const secondSerialized = localStableStringify(secondMap);
      const secondSentinel = JSON.parse(secondSerialized);

      assert.equal(typeof secondSentinel, "string");
      assert.ok(secondSentinel.startsWith("\u0000cat32:map:"));
    } finally {
      globalThis.FinalizationRegistry = originalFinalizationRegistry;
    }
  },
);
