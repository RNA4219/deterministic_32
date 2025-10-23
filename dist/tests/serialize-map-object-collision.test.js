import test from "node:test";
import assert from "node:assert/strict";
import { Cat32 } from "../src/index.js";
import { stableStringify } from "../src/serialize.js";
const MAP_SENTINEL_PREFIX = "\u0000cat32:map:";
const SENTINEL_SUFFIX = "\u0000";
function decodeMapSentinel(serialized) {
    const sentinel = JSON.parse(serialized);
    assert.equal(typeof sentinel, "string");
    assert.ok(sentinel.startsWith(MAP_SENTINEL_PREFIX) &&
        sentinel.endsWith(SENTINEL_SUFFIX));
    const payload = sentinel.slice(MAP_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
    return JSON.parse(payload);
}
test("Map and plain object canonical keys differ despite matching entries", () => {
    const entries = [
        ["a", 1],
        ["b", "value"],
    ];
    const map = new Map(entries);
    const plainObject = Object.fromEntries(entries);
    const mapSerialized = stableStringify(map);
    const objectSerialized = stableStringify(plainObject);
    assert.ok(mapSerialized !== objectSerialized);
    const cat = new Cat32();
    const mapAssignment = cat.assign(map);
    const objectAssignment = cat.assign(plainObject);
    assert.equal(mapAssignment.key, mapSerialized);
    assert.equal(objectAssignment.key, objectSerialized);
    assert.ok(mapAssignment.key !== objectAssignment.key);
    assert.ok(mapAssignment.hash !== objectAssignment.hash);
    const expectedEntries = entries.map(([key, value]) => [
        key,
        stableStringify(value),
    ]);
    assert.equal(JSON.stringify(decodeMapSentinel(mapAssignment.key)), JSON.stringify(expectedEntries));
    assert.equal(JSON.stringify(Object.entries(JSON.parse(objectAssignment.key))), JSON.stringify(entries.map(([key, value]) => [key, value])));
});
