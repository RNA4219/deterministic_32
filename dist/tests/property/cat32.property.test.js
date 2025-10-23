import test from "node:test";
import assert from "node:assert";
import { Cat32, stableStringify } from "../../src/index.js";
const ITERATIONS = 64;
const webCrypto = globalThis.crypto;
if (!webCrypto || typeof webCrypto.getRandomValues !== "function")
    throw new Error("WebCrypto unavailable for property tests");
test("Cat32 canonical key is stable for random object permutations", () => {
    const categorizer = new Cat32();
    for (let i = 0; i < ITERATIONS; i += 1) {
        const entries = randomObjectEntries(2);
        const shuffled = shuffle(entries.slice());
        const objectA = Object.fromEntries(entries);
        const objectB = Object.fromEntries(shuffled);
        const assignmentA = categorizer.assign(objectA);
        const assignmentB = categorizer.assign(objectB);
        assert.equal(assignmentA.key, assignmentB.key);
        assert.equal(assignmentA.index, assignmentB.index);
        assert.equal(assignmentA.key, stableStringify(objectA));
        assert.equal(assignmentB.key, stableStringify(objectB));
    }
});
test("Cat32 Map canonical key remains distinct from equivalent objects", () => {
    const categorizer = new Cat32();
    for (let i = 0; i < ITERATIONS; i += 1) {
        const entries = randomObjectEntries(1);
        const map = new Map(shuffle(entries.slice()));
        const plainObject = Object.fromEntries(entries);
        const objectAssignment = categorizer.assign(plainObject);
        const mapAssignment = categorizer.assign(map);
        assert.ok(stableStringify(map) !== stableStringify(plainObject));
        assert.equal(mapAssignment.key, stableStringify(map));
        assert.equal(objectAssignment.key, stableStringify(plainObject));
        assert.ok(mapAssignment.key !== objectAssignment.key);
        assert.ok(mapAssignment.hash !== objectAssignment.hash);
    }
});
function randomObjectEntries(depth) {
    const size = 1 + randomInt(4);
    const entries = [];
    const seen = new Set();
    while (entries.length < size) {
        const key = randomKey();
        if (seen.has(key))
            continue;
        seen.add(key);
        entries.push([key, randomValue(depth)]);
    }
    return entries;
}
function randomValue(depth) {
    if (depth <= 0)
        return randomPrimitive();
    switch (randomInt(3)) {
        case 0: return randomArray(depth - 1);
        case 1: return randomPlainObject(depth - 1);
        default: return randomPrimitive();
    }
}
function randomPrimitive() {
    switch (randomInt(5)) {
        case 0: return randomString();
        case 1: return randomNumber();
        case 2: return randomBoolean();
        case 3: return null;
        default: return undefined;
    }
}
function randomArray(depth) {
    const length = randomInt(4);
    return Array.from({ length }, () => randomValue(depth));
}
const randomPlainObject = (depth) => Object.fromEntries(randomObjectEntries(depth));
function randomInt(max) {
    if (max <= 0)
        throw new RangeError("max must be positive");
    return getRandomBytes(4).reduce((value, byte) => (value * 256) + byte, 0) % max;
}
function shuffle(values) {
    for (let i = values.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
}
const randomKey = () => bytesToHex(getRandomBytes(4));
const randomString = () => bytesToHex(getRandomBytes(6));
const randomNumber = () => (getRandomBytes(6).reduce((value, byte) => (value * 256) + byte, 0) % 2000) - 1000;
const randomBoolean = () => (getRandomBytes(1)[0] & 1) === 1;
const bytesToHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
function getRandomBytes(size) {
    const array = new Uint8Array(size);
    webCrypto.getRandomValues(array);
    return array;
}
