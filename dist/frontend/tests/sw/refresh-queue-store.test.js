import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
import { retryQueueEntry } from "../../src/sw.js";
const assertRejects = assert.rejects;
const normalizeBody = (body) => {
    if (typeof body === "string") {
        return body;
    }
    if (body === undefined || body === null) {
        return "";
    }
    return String(body);
};
const isIterableHeaders = (value) => typeof value === "object" && value !== null && Symbol.iterator in value;
const toHeaderTuples = (headers) => {
    if (!headers) {
        return [];
    }
    if (Array.isArray(headers)) {
        return headers.map(([name, value]) => [String(name), String(value)]);
    }
    if (isIterableHeaders(headers)) {
        return Array.from(headers).map(([name, value]) => [String(name), String(value)]);
    }
    return Object.entries(headers).map(([name, value]) => [
        name,
        String(value),
    ]);
};
const createFallbackHeaders = (headers) => {
    if (typeof Headers !== "undefined") {
        return new Headers(headers);
    }
    class MinimalHeaders {
        #map = new Map();
        constructor(init) {
            for (const [name, value] of toHeaderTuples(init)) {
                this.append(name, value);
            }
        }
        #normalize(name) {
            return name.toLowerCase();
        }
        append(name, value) {
            const normalized = this.#normalize(name);
            const existing = this.#map.get(normalized);
            const normalizedValue = String(value);
            if (existing) {
                existing.push(normalizedValue);
                return;
            }
            this.#map.set(normalized, [normalizedValue]);
        }
        delete(name) {
            this.#map.delete(this.#normalize(name));
        }
        get(name) {
            const values = this.#map.get(this.#normalize(name));
            if (!values) {
                return null;
            }
            return values.join(", ");
        }
        has(name) {
            return this.#map.has(this.#normalize(name));
        }
        set(name, value) {
            this.#map.set(this.#normalize(name), [String(value)]);
        }
        forEach(callback, thisArg) {
            for (const [name, values] of this.#map.entries()) {
                callback.call(thisArg, values.join(", "), name, this);
            }
        }
        *entries() {
            for (const [name, values] of this.#map.entries()) {
                yield [name, values.join(", ")];
            }
        }
        *keys() {
            yield* this.#map.keys();
        }
        *values() {
            for (const values of this.#map.values()) {
                yield values.join(", ");
            }
        }
        [Symbol.iterator]() {
            return this.entries();
        }
    }
    return new MinimalHeaders(headers);
};
const cloneHeaders = (headers) => {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
        return headers;
    }
    return Array.from(headers, ([name, value]) => [String(name), String(value)]);
};
const createFallbackRequest = () => {
    class MinimalRequest {
        method;
        url;
        headers;
        #body;
        constructor(input, init) {
            this.url = typeof input === "string" ? input : input.toString();
            this.method = init?.method ?? "GET";
            this.headers = createFallbackHeaders(init?.headers);
            this.#body = normalizeBody(init?.body);
        }
        clone() {
            return new MinimalRequest(this.url, {
                method: this.method,
                headers: cloneHeaders(this.headers),
                body: this.#body,
            });
        }
        async text() {
            return this.#body;
        }
    }
    return MinimalRequest;
};
const RequestCtor = typeof Request !== "undefined" ? Request : createFallbackRequest();
test("retryQueueEntry throws when record is missing", async () => {
    const recordId = "missing-record";
    let attemptInvocations = 0;
    let recordAttemptInvocations = 0;
    let recordFailureInvocations = 0;
    let recordSuccessInvocations = 0;
    const store = {
        enqueue(request) {
            return createRefreshQueueStore().enqueue(request);
        },
        get(id) {
            assert.equal(id, recordId, "retryQueueEntry should query the provided record identifier");
            return undefined;
        },
        recordAttempt() {
            recordAttemptInvocations += 1;
        },
        recordFailure() {
            recordFailureInvocations += 1;
        },
        recordSuccess() {
            recordSuccessInvocations += 1;
        },
    };
    await assertRejects(async () => {
        await retryQueueEntry(store, recordId, async () => {
            attemptInvocations += 1;
            return undefined;
        });
    }, (error) => {
        if (!(error instanceof Error)) {
            return false;
        }
        assert.equal(error.message, `Unknown refresh queue entry: ${recordId}`, "retryQueueEntry should throw when no queue entry exists");
        return true;
    });
    assert.equal(attemptInvocations, 0, "attempt should not be executed when entry is missing");
    assert.equal(recordAttemptInvocations, 0, "recordAttempt should not be called when entry lookup fails");
    assert.equal(recordFailureInvocations, 0, "recordFailure should not be called when entry lookup fails");
    assert.equal(recordSuccessInvocations, 0, "recordSuccess should not be called when entry lookup fails");
});
test("retryQueueEntry records failure metadata and preserves entry", async () => {
    const store = createRefreshQueueStore();
    const request = new RequestCtor("https://example.test/refresh", { method: "PUT" });
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
test("retryQueueEntry resolves with attempt result and removes entry on success", async () => {
    const store = createRefreshQueueStore();
    const request = new RequestCtor("https://example.test/refresh", { method: "PATCH" });
    const { id } = store.enqueue(request);
    const attemptResult = { status: "ok" };
    const result = await retryQueueEntry(store, id, async () => {
        const recordDuringAttempt = store.get(id);
        if (!recordDuringAttempt) {
            throw new Error("record should exist during successful attempt");
        }
        assert.equal(recordDuringAttempt.attempts, 1, "recordAttempt should increment attempts before running attempt");
        assert.ok(recordDuringAttempt.lastAttemptedAt instanceof Date, "recordAttempt should set lastAttemptedAt before attempt resolves");
        assert.equal(recordDuringAttempt.lastError, undefined, "recordFailure metadata should not be set during successful attempt");
        assert.equal(recordDuringAttempt.failedAt, undefined, "recordFailure timestamp should remain unset during successful attempt");
        return attemptResult;
    });
    assert.equal(result, attemptResult, "retryQueueEntry should resolve with attempt result");
    assert.equal(store.get(id), undefined, "recordSuccess should remove the successful record");
});
