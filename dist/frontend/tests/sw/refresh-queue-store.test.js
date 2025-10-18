import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
import { retryQueueEntry } from "../../src/sw.js";
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
                this.set(name, value);
            }
        }
        #normalize(name) {
            return name.toLowerCase();
        }
        append(name, value) {
            this.set(name, value);
        }
        delete(name) {
            this.#map.delete(this.#normalize(name));
        }
        get(name) {
            return this.#map.get(this.#normalize(name)) ?? null;
        }
        has(name) {
            return this.#map.has(this.#normalize(name));
        }
        set(name, value) {
            this.#map.set(this.#normalize(name), String(value));
        }
        forEach(callback, thisArg) {
            for (const [name, value] of this.#map.entries()) {
                callback.call(thisArg, value, name, this);
            }
        }
        *entries() {
            for (const [name, value] of this.#map.entries()) {
                yield [name, value];
            }
        }
        *keys() {
            yield* this.#map.keys();
        }
        *values() {
            yield* this.#map.values();
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
