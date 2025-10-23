import test from "node:test";
import assert from "node:assert/strict";
import { stableStringify } from "../src/serialize.js";
const MAP_SENTINEL_PREFIX = "\u0000cat32:map:";
const MAP_ENTRY_INDEX_SENTINEL_PREFIX = "\u0000cat32:map-entry-index:";
const SENTINEL_SUFFIX = "\u0000";
function decodeMapSentinel(serialized) {
    const sentinel = JSON.parse(serialized);
    assert.equal(typeof sentinel, "string");
    assert.ok(sentinel.startsWith(MAP_SENTINEL_PREFIX) &&
        sentinel.endsWith(SENTINEL_SUFFIX));
    const payload = sentinel.slice(MAP_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
    return JSON.parse(payload);
}
function decodeMapEntryPropertyKey(propertyKey) {
    if (propertyKey.startsWith(MAP_ENTRY_INDEX_SENTINEL_PREFIX) &&
        propertyKey.endsWith(SENTINEL_SUFFIX)) {
        const payload = propertyKey.slice(MAP_ENTRY_INDEX_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
        const [, symbolSentinel, index] = JSON.parse(payload);
        assert.equal(index, 0);
        return symbolSentinel;
    }
    return propertyKey;
}
test("stableStringify handles local symbol sentinel reuse for map keys", () => {
    const localSymbol = Symbol("map-key");
    const symbolSerialized = stableStringify(localSymbol);
    const symbolSentinel = JSON.parse(symbolSerialized);
    assert.equal(typeof symbolSentinel, "string");
    assert.ok(symbolSentinel.startsWith("__symbol__:"));
    const map = new Map([[localSymbol, "value"]]);
    const mapSerialized = stableStringify(map);
    const entries = decodeMapSentinel(mapSerialized);
    assert.equal(entries.length, 1);
    const [propertyKey, valueSerialized] = entries[0];
    assert.equal(decodeMapEntryPropertyKey(propertyKey), symbolSentinel);
    assert.equal(JSON.parse(valueSerialized), "value");
    assert.equal(stableStringify(localSymbol), symbolSerialized);
});
