import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
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
const createRequest = (input, init) => new RequestCtor(input, init);
test("MinimalHeaders append concatenates values across accessors", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Headers");
    Object.defineProperty(globalThis, "Headers", {
        configurable: true,
        writable: true,
        value: undefined,
    });
    try {
        const headers = createFallbackHeaders();
        headers.append("accept", "text/html");
        headers.append("accept", "application/json");
        assert.equal(headers.get("accept"), "text/html, application/json");
        assert.deepEqual([...headers.entries()], [["accept", "text/html, application/json"]]);
        assert.deepEqual([...headers.values()], ["text/html, application/json"]);
    }
    finally {
        if (descriptor) {
            Object.defineProperty(globalThis, "Headers", descriptor);
        }
        else {
            delete globalThis.Headers;
        }
    }
});
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
test("recordAttempt updates attempt metadata", async () => {
    const store = createRefreshQueueStore();
    const request = createRequest("https://example.test/api", { method: "POST" });
    const { id } = store.enqueue(request);
    store.recordAttempt(id);
    const record = store.get(id);
    assert.ok(record, "record should exist after first attempt");
    if (!record) {
        throw new Error("record must exist to assert attempts");
    }
    assert.equal(record.attempts, 1, "attempts should increment after first recordAttempt");
    const firstAttemptedAt = record.lastAttemptedAt;
    assert.ok(firstAttemptedAt instanceof Date, "lastAttemptedAt should be a Date instance");
    if (!(firstAttemptedAt instanceof Date)) {
        throw new Error("lastAttemptedAt should exist after first recordAttempt");
    }
    await new Promise((resolve) => {
        setTimeout(resolve, 5);
    });
    store.recordAttempt(id);
    const updatedRecord = store.get(id);
    assert.ok(updatedRecord, "record should exist after second attempt");
    if (!updatedRecord) {
        throw new Error("record must exist after second attempt");
    }
    assert.equal(updatedRecord.attempts, 2, "attempts should reflect the number of times recordAttempt is called");
    const secondAttemptedAt = updatedRecord.lastAttemptedAt;
    assert.ok(secondAttemptedAt instanceof Date, "lastAttemptedAt should remain a Date instance after subsequent attempts");
    if (!(secondAttemptedAt instanceof Date)) {
        throw new Error("lastAttemptedAt should exist after second recordAttempt");
    }
    assert.ok(secondAttemptedAt.getTime() > firstAttemptedAt.getTime(), "lastAttemptedAt should update to a more recent timestamp");
});
test("recordAttempt records Date.now value on each attempt", () => {
    const store = createRefreshQueueStore();
    const request = createRequest("https://example.test/api", { method: "POST" });
    const { id } = store.enqueue(request);
    const timestamps = [1_000, 2_000, 3_000];
    let nowCallIndex = 0;
    const originalNow = Date.now;
    Date.now = () => {
        const value = timestamps[nowCallIndex] ?? timestamps[timestamps.length - 1];
        nowCallIndex = Math.min(nowCallIndex + 1, timestamps.length);
        return value;
    };
    try {
        const observedTimes = [];
        for (const [index, expectedTimestamp] of timestamps.entries()) {
            store.recordAttempt(id);
            const record = store.get(id);
            assert.ok(record, "record should exist while recording attempts");
            if (!record) {
                throw new Error("record must exist for attempt assertions");
            }
            assert.equal(record.attempts, index + 1, "attempts should increment for each recordAttempt call");
            const { lastAttemptedAt } = record;
            assert.ok(lastAttemptedAt instanceof Date, "lastAttemptedAt should be a Date instance after each attempt");
            if (!(lastAttemptedAt instanceof Date)) {
                throw new Error("lastAttemptedAt should be set after recordAttempt");
            }
            const recordedTime = lastAttemptedAt.getTime();
            observedTimes.push(recordedTime);
            assert.equal(recordedTime, expectedTimestamp, "lastAttemptedAt should reflect the mocked Date.now value");
            if (index > 0) {
                assert.ok(recordedTime !== observedTimes[index - 1], "lastAttemptedAt should update to a new timestamp for each attempt");
            }
        }
        assert.deepEqual(observedTimes, timestamps, "recordAttempt should capture each mocked Date.now value in sequence");
    }
    finally {
        Date.now = originalNow;
    }
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
