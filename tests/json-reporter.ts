import { Transform, type TransformCallback } from "node:stream";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type TestEvent = { readonly type: string; readonly data?: unknown };
export type SerializableTestEvent = { readonly type: string; readonly data?: JsonValue };

const CIRCULAR = "[Circular]" as const;

function normalizeError(error: Error, seen: WeakSet<object>): JsonObject {
  const base: JsonObject = { name: error.name, message: error.message };
  if (typeof error.stack === "string") base.stack = error.stack;
  if ("code" in error && error.code !== undefined) base.code = normalizeUnknown(error.code, seen);
  if ("cause" in error && error.cause !== undefined) base.cause = normalizeUnknown(error.cause, seen);
  return base;
}

function normalizeObject(value: object, seen: WeakSet<object>): JsonValue {
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeUnknown(item, seen));
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
    const plain: JsonObject = {};
    for (const key of Object.keys(value)) {
      plain[key] = normalizeUnknown(value[key], seen);
    }
    return plain;
  } finally {
    seen.delete(value);
  }
}

function normalizeUnknown(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null) return null;
  const type = typeof value;
  switch (type) {
    case "string":
    case "boolean":
      return value as string | boolean;
    case "number": {
      const numeric = value as number;
      return Number.isFinite(numeric) ? numeric : numeric.toString();
    }
    case "bigint":
    case "symbol":
      return (value as { toString(): string }).toString();
    case "undefined":
      return null;
    case "function": {
      const fn = value as (...arguments_: unknown[]) => unknown;
      return fn.name ? `[Function: ${fn.name}]` : "[Function]";
    }
  }
  if (value instanceof Error) return normalizeError(value, seen);
  if (typeof value !== "object") return String(value);
  return normalizeObject(value as object, seen);
}

function toSerializableEvent(event: TestEvent): SerializableTestEvent {
  const seen = new WeakSet<object>();
  return { type: event.type, data: event.data === undefined ? undefined : normalizeUnknown(event.data, seen) };
}

export default class JsonReporter extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  override _transform(event: TestEvent, _encoding: string, callback: TransformCallback): void {
    try {
      callback(null, `${JSON.stringify(toSerializableEvent(event))}\n`);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export { toSerializableEvent };
