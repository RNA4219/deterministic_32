import assert from "node:assert/strict";
import test from "node:test";

import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
import { retryQueueEntry } from "../../src/sw.js";

type RequestConstructor = new (input: string | URL, init?: RequestInit) => Request;
type HeadersInput = RequestInit["headers"] | Iterable<readonly [string, string]>;

const normalizeBody = (body: unknown): string => {
  if (typeof body === "string") {
    return body;
  }
  if (body === undefined || body === null) {
    return "";
  }
  return String(body);
};

const isIterableHeaders = (
  value: unknown,
): value is Iterable<readonly [string, string]> =>
  typeof value === "object" && value !== null && Symbol.iterator in value;

const toHeaderTuples = (
  headers?: HeadersInput,
): Array<readonly [string, string]> => {
  if (!headers) {
    return [];
  }
  if (Array.isArray(headers)) {
    return headers.map(([name, value]) => [String(name), String(value)]);
  }
  if (isIterableHeaders(headers)) {
    return Array.from(headers).map(([name, value]) => [String(name), String(value)]);
  }
  return Object.entries(headers as Record<string, unknown>).map(([name, value]) => [
    name,
    String(value),
  ]);
};

const createFallbackHeaders = (headers?: HeadersInput): Headers => {
  if (typeof Headers !== "undefined") {
    return new Headers(headers as HeadersInit);
  }

  class MinimalHeaders implements Iterable<readonly [string, string]> {
    readonly #map = new Map<string, string[]>();

    constructor(init?: HeadersInput) {
      for (const [name, value] of toHeaderTuples(init)) {
        this.append(name, value);
      }
    }

    #normalize(name: string): string {
      return name.toLowerCase();
    }

    append(name: string, value: string): void {
      const normalized = this.#normalize(name);
      const existing = this.#map.get(normalized);
      const normalizedValue = String(value);
      if (existing) {
        existing.push(normalizedValue);
        return;
      }
      this.#map.set(normalized, [normalizedValue]);
    }

    delete(name: string): void {
      this.#map.delete(this.#normalize(name));
    }

    get(name: string): string | null {
      const values = this.#map.get(this.#normalize(name));
      if (!values) {
        return null;
      }
      return values.join(", ");
    }

    has(name: string): boolean {
      return this.#map.has(this.#normalize(name));
    }

    set(name: string, value: string): void {
      this.#map.set(this.#normalize(name), [String(value)]);
    }

    forEach(
      callback: (value: string, name: string, parent: Headers) => void,
      thisArg?: unknown,
    ): void {
      for (const [name, values] of this.#map.entries()) {
        callback.call(thisArg, values.join(", "), name, this as unknown as Headers);
      }
    }

    *entries(): IterableIterator<readonly [string, string]> {
      for (const [name, values] of this.#map.entries()) {
        yield [name, values.join(", ")];
      }
    }

    *keys(): IterableIterator<string> {
      yield* this.#map.keys();
    }

    *values(): IterableIterator<string> {
      for (const values of this.#map.values()) {
        yield values.join(", ");
      }
    }

    [Symbol.iterator](): IterableIterator<readonly [string, string]> {
      return this.entries();
    }
  }

  return new MinimalHeaders(headers) as unknown as Headers;
};

const cloneHeaders = (headers: Headers): RequestInit["headers"] => {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers;
  }
  return Array.from(
    headers as Iterable<readonly [string, string]>,
    ([name, value]) => [String(name), String(value)] as [string, string],
  );
};

const createFallbackRequest = (): RequestConstructor => {
  class MinimalRequest {
    readonly method: string;
    readonly url: string;
    readonly headers: Headers;
    readonly #body: string;

    constructor(input: string | URL, init?: RequestInit) {
      this.url = typeof input === "string" ? input : input.toString();
      this.method = init?.method ?? "GET";
      this.headers = createFallbackHeaders(init?.headers);
      this.#body = normalizeBody(init?.body);
    }

    clone(): Request {
      return new MinimalRequest(this.url, {
        method: this.method,
        headers: cloneHeaders(this.headers),
        body: this.#body,
      }) as unknown as Request;
    }

    async text(): Promise<string> {
      return this.#body;
    }
  }

  return MinimalRequest as unknown as RequestConstructor;
};

const RequestCtor: RequestConstructor =
  typeof Request !== "undefined" ? Request : createFallbackRequest();

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
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "Headers", descriptor);
    } else {
      delete (globalThis as { Headers?: typeof Headers }).Headers;
    }
  }
});

test("retryQueueEntry records failure metadata and preserves entry", async () => {
  const store = createRefreshQueueStore();
  const request = new RequestCtor("https://example.test/refresh", { method: "PUT" });
  const { id } = store.enqueue(request);

  const error = new Error("upstream unavailable");

  let caught: unknown;
  try {
    await retryQueueEntry(store, id, async () => {
      throw error;
    });
  } catch (thrown) {
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
    assert.equal(
      recordDuringAttempt.attempts,
      1,
      "recordAttempt should increment attempts before running attempt",
    );
    assert.ok(
      recordDuringAttempt.lastAttemptedAt instanceof Date,
      "recordAttempt should set lastAttemptedAt before attempt resolves",
    );
    assert.equal(
      recordDuringAttempt.lastError,
      undefined,
      "recordFailure metadata should not be set during successful attempt",
    );
    assert.equal(
      recordDuringAttempt.failedAt,
      undefined,
      "recordFailure timestamp should remain unset during successful attempt",
    );
    return attemptResult;
  });

  assert.equal(result, attemptResult, "retryQueueEntry should resolve with attempt result");
  assert.equal(store.get(id), undefined, "recordSuccess should remove the successful record");
});
