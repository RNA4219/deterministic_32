import test from "node:test";
import assert from "node:assert/strict";
import JsonReporter, { toSerializableEvent } from "./json-reporter.js";
test("JSON reporter emits newline-delimited entries", async () => {
    const reporter = new JsonReporter();
    const events = [
        { type: "test:start", data: { name: "suite", nesting: 0 } },
        { type: "test:pass", data: { name: "case", nesting: 1, duration_ms: 5 } },
    ];
    const output = [];
    reporter.on("data", (chunk) => {
        output.push(typeof chunk === "string" ? chunk : String(chunk));
    });
    reporter.on("error", (error) => {
        throw error instanceof Error ? error : new Error(String(error));
    });
    for (const event of events) {
        reporter.write(event);
    }
    reporter.end();
    await new Promise((resolve) => {
        reporter.on("end", () => resolve());
    });
    assert.equal(output.length, events.length);
    output.forEach((line, index) => {
        const parsed = JSON.parse(line);
        assert.deepEqual(parsed, toSerializableEvent(events[index]));
    });
});
test("JSON reporter normalizes errors", () => {
    const baseError = Object.assign(new Error("boom"), { code: "EFAIL" });
    const event = { type: "test:fail", data: { details: { error: baseError } } };
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
