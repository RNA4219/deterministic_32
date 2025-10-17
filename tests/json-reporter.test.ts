import test from "node:test";
import assert from "node:assert/strict";

import JsonReporter, { toSerializableEvent, type TestEvent } from "./json-reporter.js";

test("JSON reporter emits newline-delimited entries", async () => {
  const reporter = new JsonReporter();
  const events: TestEvent[] = [
    { type: "test:start", data: { name: "suite", nesting: 0 } },
    { type: "test:pass", data: { name: "case", nesting: 1, duration_ms: 5 } },
  ];

  const output: string[] = [];

  reporter.on("data", (chunk: unknown) => {
    output.push(typeof chunk === "string" ? chunk : String(chunk));
  });

  reporter.on("error", (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  });

  for (const event of events) {
    reporter.write(event);
  }

  reporter.end();

  await new Promise<void>((resolve) => {
    reporter.on("end", () => resolve());
  });

  assert.equal(output.length, events.length);

  output.forEach((line, index) => {
    const parsed = JSON.parse(line) as ReturnType<typeof toSerializableEvent>;
    assert.deepEqual(parsed, toSerializableEvent(events[index]!));
  });
});

test("JSON reporter normalizes errors", () => {
  const baseError = Object.assign(new Error("boom"), { code: "EFAIL" });
  const event: TestEvent = { type: "test:fail", data: { details: { error: baseError } } };
  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, {
    details: {
      error: {
        name: "Error",
        message: "boom",
        code: "EFAIL",
        stack: baseError.stack,
      },
    },
  });
});

test("JSON reporter expands shared references without cycles", () => {
  const sharedArray = [1, { nested: true }];
  const sharedObject = { foo: "bar" };
  const event: TestEvent = {
    type: "test:diagnostic",
    data: {
      first: { array: sharedArray, object: sharedObject },
      second: { array: sharedArray, object: sharedObject },
    },
  };

  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, {
    first: { array: [1, { nested: true }], object: { foo: "bar" } },
    second: { array: [1, { nested: true }], object: { foo: "bar" } },
  });
});

test("JSON reporter serializes shared references without circular markers", () => {
  const shared = { value: 42 };
  const event: TestEvent = {
    type: "test:data",
    data: { first: shared, second: shared },
  };

  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, {
    first: { value: 42 },
    second: { value: 42 },
  });
});

test("JSON reporter serializes typed array views with byte offsets", () => {
  const backing = new Uint8Array([5, 10, 15, 20]);
  const view = new Uint8Array(backing.buffer, 1, 2);
  const event: TestEvent = { type: "test:data", data: view };

  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, [10, 15]);
});

test("JSON reporter respects ArrayBuffer view offsets", () => {
  const source = new Uint8Array([10, 20, 30, 40]).buffer;
  const event: TestEvent = {
    type: "test:data",
    data: {
      typed: new Uint8Array(source, 1, 2),
      dataView: new DataView(source, 1, 2),
    },
  };

  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, {
    typed: [20, 30],
    dataView: [20, 30],
  });
});
