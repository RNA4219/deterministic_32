import { Transform } from "node:stream";
const CIRCULAR = "[Circular]";
function normalizeError(error, seen) {
    const base = { name: error.name, message: error.message };
    if (typeof error.stack === "string")
        base.stack = error.stack;
    if ("code" in error && error.code !== undefined)
        base.code = normalizeUnknown(error.code, seen);
    if ("cause" in error && error.cause !== undefined)
        base.cause = normalizeUnknown(error.cause, seen);
    return base;
}
function normalizeObject(value, seen) {
    if (seen.has(value))
        return CIRCULAR;
    seen.add(value);
    try {
        if (Array.isArray(value))
            return value.map((item) => normalizeUnknown(item, seen));
        if (ArrayBuffer.isView(value)) {
            return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        }
        const isSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer;
        if (value instanceof ArrayBuffer || isSharedArrayBuffer) {
            const buffer = value;
            return Array.from(new Uint8Array(buffer));
        }
        const plain = {};
        for (const [key, entryValue] of Object.entries(value)) {
            plain[key] = normalizeUnknown(entryValue, seen);
        }
        return plain;
    }
    finally {
        seen.delete(value);
    }
}
function normalizeUnknown(value, seen) {
    if (value === null)
        return null;
    const type = typeof value;
    switch (type) {
        case "string":
        case "boolean":
            return value;
        case "number": {
            const numeric = value;
            return Number.isFinite(numeric) ? numeric : numeric.toString();
        }
        case "bigint":
        case "symbol":
            return value.toString();
        case "undefined":
            return null;
        case "function": {
            const fn = value;
            return fn.name ? `[Function: ${fn.name}]` : "[Function]";
        }
    }
    if (value instanceof Error)
        return normalizeError(value, seen);
    if (typeof value !== "object")
        return String(value);
    return normalizeObject(value, seen);
}
function toSerializableEvent(event) {
    const seen = new WeakSet();
    return { type: event.type, data: event.data === undefined ? undefined : normalizeUnknown(event.data, seen) };
}
export default class JsonReporter extends Transform {
    constructor() {
        super({ writableObjectMode: true });
    }
    _transform(event, _encoding, callback) {
        try {
            callback(null, `${JSON.stringify(toSerializableEvent(event))}\n`);
        }
        catch (error) {
            callback(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
export { toSerializableEvent };
