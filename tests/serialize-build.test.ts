import test from "node:test";
import assert from "node:assert";

const typedArray = new Uint8Array([1, 2, 3]);

const hasSharedArrayBuffer = typeof SharedArrayBuffer === "function";

async function loadStableStringify() {
  const moduleUrl = new URL("../../dist/serialize.js", import.meta.url);
  const module = await import(moduleUrl.href);
  return module.stableStringify;
}

test("stableStringify encodes typed array metadata and bytes", async () => {
  const stableStringify = await loadStableStringify();
  const value = new Uint8Array(typedArray);
  const serialized = JSON.parse(stableStringify(value));

  assert.ok(serialized.startsWith("\u0000cat32:typedarray:"));
  assert.ok(serialized.includes("kind=Uint8Array"));
  assert.ok(serialized.includes("byteLength=3"));
  assert.ok(serialized.includes("length=3"));
  assert.ok(serialized.endsWith("hex=010203\u0000"));
});

test("stableStringify encodes ArrayBuffer bytes", async () => {
  const stableStringify = await loadStableStringify();
  const value = typedArray.buffer.slice(0);
  const serialized = JSON.parse(stableStringify(value));

  assert.ok(serialized.startsWith("\u0000cat32:arraybuffer:"));
  assert.ok(serialized.includes("byteLength=3"));
  assert.ok(serialized.endsWith("hex=010203\u0000"));
});

if (hasSharedArrayBuffer) {
  test("stableStringify encodes SharedArrayBuffer bytes", async () => {
    const stableStringify = await loadStableStringify();
    const shared = new SharedArrayBuffer(typedArray.byteLength);
    const view = new Uint8Array(shared);
    view.set(typedArray);
    const serialized = JSON.parse(stableStringify(shared));

    assert.ok(serialized.startsWith("\u0000cat32:sharedarraybuffer:"));
    assert.ok(serialized.includes("byteLength=3"));
    assert.ok(serialized.endsWith("hex=010203\u0000"));
  });
}
