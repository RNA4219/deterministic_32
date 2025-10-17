import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
import { retryQueueEntry } from "../../src/sw.js";
test("retryQueueEntry records failure metadata and preserves entry", async () => {
    const store = createRefreshQueueStore();
    const request = new Request("https://example.test/refresh", { method: "PUT" });
    const { id } = store.enqueue(request);
    const error = new Error("upstream unavailable");
    let caught;
    try {
        await retryQueueEntry(store, id, async () => {
            throw error;
        });
    }
    catch (thrown) {
        caught = thrown;
    }
    if (caught === undefined) {
        throw new Error("retryQueueEntry should throw when attempt fails");
    }
    assert.equal(caught, error, "retryQueueEntry should surface thrown error");
    const record = store.get(id);
    if (!record) {
        throw new Error("record should still exist after retry failure");
    }
    assert.equal(record.attempts, 1, "recordAttempt should run before retry");
    assert.equal(record.lastError, error, "recordFailure should store the thrown error");
    assert.ok(record.failedAt instanceof Date, "failure timestamp should be saved");
});
