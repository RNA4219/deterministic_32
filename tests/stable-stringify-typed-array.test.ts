import test from "node:test";
import assert from "node:assert";

import { Cat32, stableStringify } from "../src/index.js";

test("stableStringify distinguishes typed array views by content", () => {
  const left = new Uint8Array([1, 2]);
  const right = new Uint8Array([1, 3]);

  assert.ok(stableStringify(left) !== stableStringify(right));
});

test("stableStringify distinguishes ArrayBuffer instances by content", () => {
  const left = new Uint8Array([1, 2]).buffer;
  const right = new Uint8Array([1, 3]).buffer;

  assert.ok(stableStringify(left) !== stableStringify(right));
});

test("Cat32 assign key differs for ArrayBuffers with different content", () => {
  const cat = new Cat32();
  const left = new Uint8Array([1, 2]).buffer;
  const right = new Uint8Array([1, 3]).buffer;

  const assignmentLeft = cat.assign(left);
  const assignmentRight = cat.assign(right);

  assert.ok(assignmentLeft.key !== assignmentRight.key);
  assert.ok(assignmentLeft.hash !== assignmentRight.hash);
});

test("Cat32 assign distinguishes typed array from its serialized string", () => {
  const cat = new Cat32();
  const typedArray = new Uint8Array([1, 2, 3]);
  const serialized = JSON.parse(stableStringify(typedArray));

  const typedAssignment = cat.assign(typedArray);
  const stringAssignment = cat.assign(serialized);

  assert.ok(typedAssignment.key !== stringAssignment.key);
  assert.ok(typedAssignment.hash !== stringAssignment.hash);
});

test("stableStringify distinguishes typed array sentinel string literal", () => {
  const typedArray = new Uint8Array([2, 3, 4]);
  const sentinelString = JSON.parse(stableStringify(typedArray));

  assert.ok(stableStringify(typedArray) !== stableStringify(sentinelString));
});

test("Cat32 assign distinguishes ArrayBuffer from its serialized string", () => {
  const cat = new Cat32();
  const arrayBuffer = new Uint8Array([4, 5]).buffer;
  const serialized = JSON.parse(stableStringify(arrayBuffer));

  const bufferAssignment = cat.assign(arrayBuffer);
  const stringAssignment = cat.assign(serialized);

  assert.ok(bufferAssignment.key !== stringAssignment.key);
  assert.ok(bufferAssignment.hash !== stringAssignment.hash);
});

test("stableStringify distinguishes ArrayBuffer sentinel string literal", () => {
  const arrayBuffer = new Uint8Array([5, 6]).buffer;
  const sentinelString = JSON.parse(stableStringify(arrayBuffer));

  assert.ok(stableStringify(arrayBuffer) !== stableStringify(sentinelString));
});

test("Cat32 assign distinguishes SharedArrayBuffer from its serialized string", () => {
  if (typeof SharedArrayBuffer !== "function") {
    assert.ok(true, "SharedArrayBuffer unavailable in this runtime");
    return;
  }

  const cat = new Cat32();
  const shared = new SharedArrayBuffer(4);
  const view = new Uint8Array(shared);
  view.set([6, 7, 8, 9]);
  const serialized = JSON.parse(stableStringify(shared));

  const bufferAssignment = cat.assign(shared);
  const stringAssignment = cat.assign(serialized);

  assert.ok(bufferAssignment.key !== stringAssignment.key);
  assert.ok(bufferAssignment.hash !== stringAssignment.hash);
});

test("stableStringify distinguishes SharedArrayBuffer sentinel string literal", () => {
  if (typeof SharedArrayBuffer !== "function") {
    assert.ok(true, "SharedArrayBuffer unavailable in this runtime");
    return;
  }

  const shared = new SharedArrayBuffer(6);
  const view = new Uint8Array(shared);
  view.set([7, 8, 9, 10, 11, 12]);
  const sentinelString = JSON.parse(stableStringify(shared));

  assert.ok(stableStringify(shared) !== stableStringify(sentinelString));
});

test("Cat32 assign distinguishes Map with typed array key from serialized key", () => {
  const cat = new Cat32();
  const typedArray = new Uint8Array([10, 11]);
  const mapWithTypedKey = new Map([[typedArray, 1]]);
  const mapWithSerializedKey = new Map([[stableStringify(typedArray), 1]]);

  const typedAssignment = cat.assign(mapWithTypedKey);
  const stringAssignment = cat.assign(mapWithSerializedKey);

  assert.ok(typedAssignment.key !== stringAssignment.key);
  assert.ok(typedAssignment.hash !== stringAssignment.hash);
});

test(
  "Cat32 assign distinguishes Map typed array key collision with sentinel string",
  () => {
    const cat = new Cat32();
    const first = new Uint8Array([12, 13]);
    const second = new Uint8Array([12, 13]);
    const mapWithTypedKeys = new Map<unknown, number>([
      [first, 1],
      [second, 2],
    ]);

    const sentinelLiteral = JSON.parse(stableStringify(second));
    const mapEntryIndexSentinel = "\u0000cat32:map-entry-index:1\u0000";
    const collisionString = `__string__:${sentinelLiteral}${mapEntryIndexSentinel}`;
    const mapWithCollisionString = new Map<unknown, number>([
      [first, 1],
      [collisionString, 2],
    ]);

    const typedAssignment = cat.assign(mapWithTypedKeys);
    const stringAssignment = cat.assign(mapWithCollisionString);

    assert.ok(typedAssignment.key !== stringAssignment.key);
    assert.ok(typedAssignment.hash !== stringAssignment.hash);
  },
);
