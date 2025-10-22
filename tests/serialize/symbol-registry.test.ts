import test from "node:test";
import assert from "node:assert/strict";

import {
  Cat32,
  stableStringify,
} from "../../src/index.js";
import {
  __getLocalSymbolSentinelRecordForTest,
  __peekLocalSymbolSentinelRecordForTest,
} from "../../src/serialize.js";

test("ローカルシンボルのセンチネルレコードがキャッシュされる", () => {
  const local = Symbol("local sentinel");

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(local),
    undefined,
    "登録前はレコードが存在しない",
  );

  const firstRecord = __getLocalSymbolSentinelRecordForTest(local);

  assert.equal(typeof firstRecord.identifier, "string");
  assert.ok(firstRecord.identifier.length > 0);
  assert.equal(typeof firstRecord.sentinel, "string");

  const peekedRecord = __peekLocalSymbolSentinelRecordForTest(local);
  assert.equal(peekedRecord, firstRecord);

  const secondRecord = __getLocalSymbolSentinelRecordForTest(local);
  assert.equal(secondRecord, firstRecord);

  const sentinelFromRecord = firstRecord.sentinel;
  const sentinelFromStringify = JSON.parse(stableStringify(local));
  assert.equal(sentinelFromStringify, sentinelFromRecord);

  const sentinelFromStringifyAgain = JSON.parse(stableStringify(local));
  assert.equal(sentinelFromStringifyAgain, sentinelFromRecord);
});

test("ローカルシンボルのピークはレコードを生成しない", () => {
  const another = Symbol("local peek");

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    undefined,
    "ピークのみではレコードが生成されない",
  );

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    undefined,
    "複数回のピークでも生成されない",
  );

  const record = __getLocalSymbolSentinelRecordForTest(another);
  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    record,
    "センチネル作成後は同一レコードを返す",
  );
});

test("stableStringify と Cat32.assign はローカルシンボルを決定的に扱う", () => {
  const symbol = Symbol("x");

  const firstStringify = stableStringify(symbol);
  const secondStringify = stableStringify(symbol);
  assert.equal(secondStringify, firstStringify);

  const cat32 = new Cat32();

  const firstAssignment = cat32.assign(symbol);
  const secondAssignment = cat32.assign(symbol);

  assert.equal(firstAssignment.key, firstStringify);
  assert.equal(secondAssignment.key, firstStringify);
  assert.equal(secondAssignment.key, firstAssignment.key);
});
