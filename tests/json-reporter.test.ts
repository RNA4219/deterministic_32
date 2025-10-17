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

test("JSON reporter respects view ranges when normalizing binary data", () => {
  const bytes = new Uint8Array([10, 20, 30, 40]);
  const uint8View = bytes.subarray(1, 3);
  const dataView = new DataView(bytes.buffer, 2, 2);
  const event: TestEvent = {
    type: "test:data",
    data: { uint8View, dataView },
  };

  const normalized = toSerializableEvent(event);

  assert.deepEqual(normalized.data, {
    uint8View: [20, 30],
    dataView: [30, 40],
  });
});
