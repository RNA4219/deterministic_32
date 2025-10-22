import test from "node:test";
import assert from "node:assert/strict";

import {
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
