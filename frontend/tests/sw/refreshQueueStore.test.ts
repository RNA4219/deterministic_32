import assert from "node:assert/strict";
import test from "node:test";

import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";

const createRequest = (input: string, init?: RequestInit): Request =>
  new Request(input, init);

test("recordFailure keeps entry with failure metadata", () => {
  const store = createRefreshQueueStore();
  const request = createRequest("https://example.test/api", { method: "POST" });

  const { id } = store.enqueue(request);
  store.recordAttempt(id);

  const error = new Error("network down");
  store.recordFailure(id, error);

  const record = store.get(id);
  if (!record) {
    throw new Error("record should remain after failure");
  }

  assert.equal(record.lastError, error, "error reference should be stored");
  assert.ok(record.failedAt instanceof Date, "failedAt should be timestamped");
  assert.equal(record.attempts, 1, "attempt count should be preserved");
});
