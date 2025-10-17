import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
const createRequest = (input, init) => new Request(input, init);
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
test("enqueue stores cloned request with matching data", async () => {
    const store = createRefreshQueueStore();
    const request = createRequest("https://example.test/api?query=1", {
        method: "POST",
        body: JSON.stringify({ value: 42 }),
        headers: { "Content-Type": "application/json" },
    });
    const { request: storedRequest } = store.enqueue(request);
    assert.ok(storedRequest !== request, "stored request should be a cloned instance");
    assert.equal(storedRequest.method, request.method, "cloned request should preserve method");
    assert.equal(storedRequest.url, request.url, "cloned request should preserve URL");
    const [storedBody, originalBody] = await Promise.all([
        storedRequest.clone().text(),
        request.clone().text(),
    ]);
    assert.equal(storedBody, originalBody, "cloned request should preserve body content");
});
test("enqueue stores cloned request in queue map", async () => {
    const store = createRefreshQueueStore();
    const request = createRequest("https://example.test/queue", {
        method: "PUT",
        body: JSON.stringify({ flag: true }),
        headers: { "Content-Type": "application/json" },
    });
    const { id } = store.enqueue(request);
    const record = store.get(id);
    assert.ok(record, "record should exist after enqueue");
    if (!record) {
        throw new Error("record must exist for assertions");
    }
    const storedRequest = record.request;
    assert.ok(storedRequest !== request, "stored request instance should differ from original request");
    assert.equal(storedRequest.method, request.method, "stored request should preserve method");
    assert.equal(storedRequest.url, request.url, "stored request should preserve URL");
    const [storedBody, originalBody] = await Promise.all([
        storedRequest.clone().text(),
        request.clone().text(),
    ]);
    assert.equal(storedBody, originalBody, "stored request should preserve body");
});
