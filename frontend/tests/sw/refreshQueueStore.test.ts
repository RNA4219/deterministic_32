import assert from "node:assert/strict";
import test from "node:test";

import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";

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
    readonly #map = new Map<string, string>();

    constructor(init?: HeadersInput) {
      for (const [name, value] of toHeaderTuples(init)) {
        this.set(name, value);
      }
    }

    #normalize(name: string): string {
      return name.toLowerCase();
    }

    append(name: string, value: string): void {
      this.set(name, value);
    }

    delete(name: string): void {
      this.#map.delete(this.#normalize(name));
    }

    get(name: string): string | null {
      return this.#map.get(this.#normalize(name)) ?? null;
    }

    has(name: string): boolean {
      return this.#map.has(this.#normalize(name));
    }

    set(name: string, value: string): void {
      this.#map.set(this.#normalize(name), String(value));
    }

    forEach(
      callback: (value: string, name: string, parent: Headers) => void,
      thisArg?: unknown,
    ): void {
      for (const [name, value] of this.#map.entries()) {
        callback.call(thisArg, value, name, this as unknown as Headers);
      }
    }

    *entries(): IterableIterator<readonly [string, string]> {
      for (const [name, value] of this.#map.entries()) {
        yield [name, value];
      }
    }

    *keys(): IterableIterator<string> {
      yield* this.#map.keys();
    }

    *values(): IterableIterator<string> {
      yield* this.#map.values();
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

const createRequest = (input: string, init?: RequestInit): Request =>
  new RequestCtor(input, init);

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
  assert.equal(
    storedRequest.method,
    request.method,
    "cloned request should preserve method",
  );
  assert.equal(storedRequest.url, request.url, "cloned request should preserve URL");

  const [storedBody, originalBody] = await Promise.all([
    storedRequest.clone().text(),
    request.clone().text(),
  ]);

  assert.equal(
    storedBody,
    originalBody,
    "cloned request should preserve body content",
  );
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
  assert.ok(
    storedRequest !== request,
    "stored request instance should differ from original request",
  );
  assert.equal(
    storedRequest.method,
    request.method,
    "stored request should preserve method",
  );
  assert.equal(
    storedRequest.url,
    request.url,
    "stored request should preserve URL",
  );

  const [storedBody, originalBody] = await Promise.all([
    storedRequest.clone().text(),
    request.clone().text(),
  ]);

  assert.equal(
    storedBody,
    originalBody,
    "stored request should preserve body",
  );
});
