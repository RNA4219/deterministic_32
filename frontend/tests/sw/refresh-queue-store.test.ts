import assert from "node:assert/strict";
import test from "node:test";

import { createRefreshQueueStore } from "../../src/sw/refreshQueueStore.js";
import { retryQueueEntry } from "../../src/sw.js";

type RequestConstructor = new (input: string | URL, init?: RequestInit) => Request;

const normalizeBody = (body: unknown): string => {
  if (typeof body === "string") {
    return body;
  }
  if (body === undefined || body === null) {
    return "";
  }
  return String(body);
};

const createFallbackRequest = (): RequestConstructor => {
  class MinimalRequest {
    readonly method: string;
    readonly url: string;
    readonly #body: string;
    readonly #headers: RequestInit["headers"];

    constructor(input: string | URL, init?: RequestInit) {
      this.url = typeof input === "string" ? input : input.toString();
      this.method = init?.method ?? "GET";
      this.#headers = init?.headers;
      this.#body = normalizeBody(init?.body);
    }

    clone(): Request {
      return new MinimalRequest(this.url, {
        method: this.method,
        headers: this.#headers,
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
