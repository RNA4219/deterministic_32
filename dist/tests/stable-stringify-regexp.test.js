import test from "node:test";
import assert from "node:assert/strict";
import { Cat32, stableStringify } from "../src/index.js";
import { typeSentinel } from "../src/serialize.js";
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
test("stableStringify distinguishes RegExp variants", () => {
    const foo = stableStringify(/foo/);
    const fooIgnoreCase = stableStringify(/foo/i);
    const fooGlobal = stableStringify(new RegExp("foo", "g"));
    const emptyObject = stableStringify({});
    assert.ok(foo !== fooIgnoreCase);
    assert.ok(foo !== fooGlobal);
    assert.ok(fooIgnoreCase !== fooGlobal);
    assert.ok(foo !== emptyObject);
    assert.ok(fooIgnoreCase !== emptyObject);
    assert.ok(fooGlobal !== emptyObject);
    assert.ok(JSON.parse(foo).startsWith("\u0000cat32:regexp:"));
    assert.ok(JSON.parse(fooIgnoreCase).startsWith("\u0000cat32:regexp:"));
    assert.ok(JSON.parse(fooGlobal).startsWith("\u0000cat32:regexp:"));
});
test("stableStringify distinguishes RegExp from RegExp sentinel string literals", () => {
    const regex = stableStringify(/foo/);
    const sentinelLiteral = typeSentinel("regexp", JSON.stringify(["foo", ""]));
    const stringLiteral = stableStringify(sentinelLiteral);
    assert.ok(regex !== stringLiteral);
    assert.ok(JSON.parse(regex).startsWith("\u0000cat32:regexp:"));
    assert.ok(JSON.parse(stringLiteral).startsWith("__string__:\u0000cat32:regexp:"));
});
test("Cat32.assign produces distinct keys and hashes for RegExp variants", () => {
    const cat = new Cat32();
    const foo = cat.assign(/foo/);
    const fooIgnoreCase = cat.assign(/foo/i);
    const emptyObject = cat.assign({});
    assert.ok(foo.key !== fooIgnoreCase.key);
    assert.ok(foo.hash !== fooIgnoreCase.hash);
    assert.ok(foo.key !== emptyObject.key);
    assert.ok(foo.hash !== emptyObject.hash);
    assert.ok(fooIgnoreCase.key !== emptyObject.key);
    assert.ok(fooIgnoreCase.hash !== emptyObject.hash);
});
test("Cat32.assign distinguishes RegExp from RegExp sentinel string literals", () => {
    const cat = new Cat32();
    const regexAssignment = cat.assign(/foo/);
    const sentinelLiteral = typeSentinel("regexp", JSON.stringify(["foo", ""]));
    const stringAssignment = cat.assign(sentinelLiteral);
    assert.ok(regexAssignment.key !== stringAssignment.key);
    assert.ok(regexAssignment.hash !== stringAssignment.hash);
});
test("stableStringify Map buckets RegExp keys without collisions", () => {
    const map = new Map([
        [/foo/, "a"],
        [/foo/i, "b"],
        [{}, "c"],
    ]);
    const serialized = stableStringify(map);
    const parsed = decodeMapSentinel(serialized);
    const keys = parsed.map(([key]) => key);
    const regexEntries = parsed.filter(([key]) => key.includes("\u0000cat32:regexp:"));
    assert.equal(parsed.length, 3);
    assert.equal(new Set(keys).size, 3);
    assert.equal(regexEntries.length, 2);
    assert.equal(new Set(regexEntries.map(([key]) => key)).size, 2);
    assert.deepStrictEqual(regexEntries.map(([, value]) => JSON.parse(value)).sort(), ["a", "b"]);
});
test("stableStringify Map separates RegExp keys from sentinel string literals", () => {
    const sentinelLiteral = typeSentinel("regexp", JSON.stringify(["foo", ""]));
    const map = new Map([
        [/foo/, "regex"],
        [sentinelLiteral, "literal"],
    ]);
    const serialized = stableStringify(map);
    const parsed = decodeMapSentinel(serialized);
    assert.equal(parsed.length, 2);
    const values = new Set(parsed.map(([, value]) => JSON.parse(value)));
    assert.ok(values.has("regex"));
    assert.ok(values.has("literal"));
});
