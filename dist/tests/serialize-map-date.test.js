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
test("stableStringify on invalid Date uses invalid sentinel payload", () => {
    const date = new Date(NaN);
    const serialized = stableStringify(date);
    assert.equal(serialized, JSON.stringify("__date__:invalid"));
});
test("Map with Date key serializes using ISO sentinel", () => {
    const date = new Date("2020-01-01T00:00:00Z");
    const map = new Map([[date, "v"]]);
    const serialized = stableStringify(map);
    const expectedKey = `__date__:${date.toISOString()}`;
    assert.deepEqual(decodeMapSentinel(serialized), [
        [expectedKey, stableStringify("v")],
    ]);
});
test("Map with invalid Date key serializes using invalid sentinel", () => {
    const date = new Date(NaN);
    const map = new Map([[date, 1]]);
    const serialized = stableStringify(map);
    const expectedKey = "__date__:invalid";
    assert.deepEqual(decodeMapSentinel(serialized), [
        [expectedKey, stableStringify(1)],
    ]);
});
test("Cat32.assign uses ISO sentinel for Map Date keys", () => {
    const date = new Date("2020-01-01T00:00:00Z");
    const map = new Map([[date, "v"]]);
    const cat = new Cat32();
    const assignment = cat.assign(map);
    const serialized = stableStringify(map);
    const expectedKey = `__date__:${date.toISOString()}`;
    assert.equal(assignment.key, serialized);
    assert.deepEqual(decodeMapSentinel(assignment.key), [
        [expectedKey, stableStringify("v")],
    ]);
});
test("Cat32.assign uses invalid sentinel for Map invalid Date keys", () => {
    const date = new Date(NaN);
    const map = new Map([[date, "v"]]);
    const cat = new Cat32();
    const assignment = cat.assign(map);
    const serialized = stableStringify(map);
    const expectedKey = "__date__:invalid";
    assert.equal(assignment.key, serialized);
    assert.deepEqual(decodeMapSentinel(assignment.key), [
        [expectedKey, stableStringify("v")],
    ]);
});
test("Map Date key canonical key differs from __string__ Date sentinel", () => {
    const date = new Date("2020-01-01T00:00:00Z");
    const dateMap = new Map([[date, 1]]);
    const stringKey = `__string__:__date__:${date.toISOString()}`;
    const stringMap = new Map([[stringKey, 1]]);
    const expectedKey = `__date__:${date.toISOString()}`;
    const cat = new Cat32();
    const dateAssignment = cat.assign(dateMap);
    const stringAssignment = cat.assign(stringMap);
    assert.ok(dateAssignment.key !== stringAssignment.key);
    assert.ok(dateAssignment.hash !== stringAssignment.hash);
    assert.deepEqual(decodeMapSentinel(dateAssignment.key), [
        [expectedKey, stableStringify(1)],
    ]);
    assert.deepEqual(decodeMapSentinel(stringAssignment.key), [
        [`__string__:${stringKey}`, stableStringify(1)],
    ]);
});
