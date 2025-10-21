import test from "node:test";
import assert from "node:assert/strict";

import { Cat32, stableStringify } from "../src/index.js";

test("string literals matching sentinel encodings are escaped", () => {
  const cat = new Cat32();

  const undefinedLiteral = "__undefined__";
  const literalAssignment = cat.assign(undefinedLiteral);
  const undefinedAssignment = cat.assign(undefined);

  assert.ok(literalAssignment.key !== undefinedAssignment.key);
  assert.equal(
    literalAssignment.key,
    JSON.stringify(`__string__:${undefinedLiteral}`),
  );
  assert.equal(
    undefinedAssignment.key,
    JSON.stringify("__undefined__"),
  );

  const canonicalDate = new Date("2024-02-03T04:05:06.789Z");
  const dateLiteral = `__date__:${canonicalDate.toISOString()}`;
  const dateLiteralAssignment = cat.assign(dateLiteral);
  const dateAssignment = cat.assign(canonicalDate);

  assert.ok(dateLiteralAssignment.key !== dateAssignment.key);
  assert.equal(
    dateLiteralAssignment.key,
    JSON.stringify(`__string__:${dateLiteral}`),
  );
  assert.equal(
    dateAssignment.key,
    JSON.stringify(`__date__:${canonicalDate.toISOString()}`),
  );
});

test("sentinel canonical encodings are preserved", () => {
  const cat = new Cat32();

  assert.equal(
    stableStringify(undefined),
    JSON.stringify("__undefined__"),
  );
  assert.equal(
    cat.assign(undefined).key,
    JSON.stringify("__undefined__"),
  );

  const date = new Date("2020-01-01T00:00:00.000Z");
  assert.equal(
    stableStringify(date),
    JSON.stringify(`__date__:${date.toISOString()}`),
  );
  assert.equal(
    cat.assign(date).key,
    JSON.stringify(`__date__:${date.toISOString()}`),
  );

  const hole: unknown[] = [];
  hole.length = 2;
  hole[1] = 1;
  const holeAssignment = cat.assign(hole);
  assert.equal(holeAssignment.key, stableStringify(hole));
  assert.ok(holeAssignment.key.includes("__hole__"));
});

test("numeric and bigint sentinel literals are escaped", () => {
  const cat = new Cat32();

  const cases: Array<{ value: number | bigint }> = [
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: 1n },
  ];

  for (const { value } of cases) {
    const sentinelLiteral = JSON.parse(stableStringify(value));
    const literalAssignment = cat.assign(sentinelLiteral);
    const actualAssignment = cat.assign(value);

    assert.ok(literalAssignment.key !== actualAssignment.key);
    assert.ok(literalAssignment.hash !== actualAssignment.hash);

    assert.equal(
      literalAssignment.key,
      JSON.stringify(`__string__:${sentinelLiteral}`),
    );
    assert.equal(actualAssignment.key, JSON.stringify(sentinelLiteral));
  }
});

test("local symbols with identical descriptions remain distinct", () => {
  const cat = new Cat32();
  const description = "duplicate";

  const first = Symbol(description);
  const second = Symbol(description);

  const setWithFirst = new Set([first]);
  const setWithSecond = new Set([second]);

  const firstAssignment = cat.assign(setWithFirst);
  const secondAssignment = cat.assign(setWithSecond);

  assert.ok(firstAssignment.key !== secondAssignment.key);
  assert.ok(firstAssignment.hash !== secondAssignment.hash);

  assert.ok(stableStringify(setWithFirst) !== stableStringify(setWithSecond));
});

test("sets with duplicate-description symbols remain distinguishable", () => {
  const cat = new Cat32();
  const description = "duplicate";

  const firstPair = new Set([Symbol(description), Symbol(description)]);
  const secondPair = new Set([Symbol(description), Symbol(description)]);

  const firstAssignment = cat.assign(firstPair);
  const secondAssignment = cat.assign(secondPair);

  assert.ok(firstAssignment.key !== secondAssignment.key);
  assert.ok(firstAssignment.hash !== secondAssignment.hash);

  assert.ok(stableStringify(firstPair) !== stableStringify(secondPair));
});

test("maps with duplicate-description symbol keys use map-entry sentinel", () => {
  const cat = new Cat32();
  const description = "duplicate";

  const firstMap = new Map([
    [Symbol(description), 1],
    [Symbol(description), 2],
  ]);
  const secondMap = new Map([
    [Symbol(description), 1],
    [Symbol(description), 2],
  ]);

  const firstAssignment = cat.assign(firstMap);
  const secondAssignment = cat.assign(secondMap);

  assert.ok(firstAssignment.key !== secondAssignment.key);
  assert.ok(firstAssignment.hash !== secondAssignment.hash);

  const firstString = stableStringify(firstMap);
  const secondString = stableStringify(secondMap);

  assert.ok(firstString.includes("map-entry-index"));
  assert.ok(secondString.includes("map-entry-index"));
  assert.ok(firstString !== secondString);
});
