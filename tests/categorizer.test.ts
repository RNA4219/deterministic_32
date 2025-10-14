// Node >=18 built-in test runner
import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";

test("deterministic mapping for object key order", () => {
  const c = new Cat32({ salt: "s", namespace: "ns" });
  const a1 = c.assign({ id: 123, tags: ["a", "b"] });
  const a2 = c.assign({ tags: ["a", "b"], id: 123 });
  assert.equal(a1.index, a2.index);
  assert.equal(a1.label, a2.label);
  assert.equal(a1.hash, a2.hash);
});

test("override by index", () => {
  const c = new Cat32({ overrides: { "hello": 7 } });
  const a = c.assign("hello");
  assert.equal(a.index, 7);
});

test("override by label", () => {
  const labels = Array.from({ length: 32 }, (_, i) => `L${i}`);
  const c = new Cat32({ labels, overrides: { "pin": "L31" } });
  const a = c.assign("pin");
  assert.equal(a.index, 31);
  assert.equal(a.label, "L31");
});

test("range 0..31 and various types", () => {
  const c = new Cat32();
  for (const k of ["a", "b", "c", "日本語", "ＡＢＣ", 123, true, null]) {
    const idx = c.index(k as any);
    assert.ok(idx >= 0 && idx <= 31);
  }
});

test("normalization NFKC merges fullwidth", () => {
  const c = new Cat32({ normalize: "nfkc" });
  const x = c.assign("Ａ"); // fullwidth A
  const y = c.assign("A");
  assert.equal(x.index, y.index);
});

test("cyclic object throws", () => {
  const a: any = { x: 1 };
  a.self = a;
  const c = new Cat32();
  assert.throws(() => c.assign(a), /Cyclic object/);
});

test("map object key differs from same-name string key", () => {
  const c = new Cat32();
  const objectKey = { foo: 1 };
  const stringKey = String(objectKey);
  const inputWithObjectKey = {
    payload: new Map<unknown, string>([
      [objectKey, "object"],
      [stringKey, "string"],
    ]),
  };
  const inputWithStringKey = {
    payload: new Map<unknown, string>([
      [stringKey, "object"],
      [objectKey, "string"],
    ]),
  };
  const a = c.assign(inputWithObjectKey);
  const b = c.assign(inputWithStringKey);
  assert.notEqual(a.key, b.key);
});
