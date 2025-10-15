// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps/Sets are serialized as arrays in insertion order (keys sorted for Map via key string).
const SENTINEL_PREFIX = "\u0000cat32:";
const SENTINEL_SUFFIX = "\u0000";
const HOLE_SENTINEL = JSON.stringify(typeSentinel("hole"));
const STRING_SENTINEL_PREFIX = `${SENTINEL_PREFIX}string:`;
const UNDEFINED_SENTINEL = "__undefined__";
const DATE_SENTINEL_PREFIX = "__date__:";
const BIGINT_SENTINEL_PREFIX = "__bigint__:";
const NUMBER_SENTINEL_PREFIX = "__number__:";
export function typeSentinel(type, payload = "") {
    return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}
export function escapeSentinelString(value) {
    const needsEscaping = value.startsWith(SENTINEL_PREFIX) && !value.startsWith(STRING_SENTINEL_PREFIX);
    const escaped = needsEscaping ? typeSentinel("string", value) : value;
    return JSON.stringify(escaped);
}
export function stableStringify(v) {
    const stack = new Set();
    return _stringify(v, stack);
}
function _stringify(v, stack) {
    if (v === null)
        return "null";
    const t = typeof v;
    if (t === "string")
        return escapeSentinelString(v);
    if (t === "number") {
        const value = v;
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return JSON.stringify(typeSentinel("number", String(value)));
        }
        return JSON.stringify(value);
    }
    if (t === "boolean")
        return JSON.stringify(v);
    if (t === "bigint")
        return JSON.stringify(typeSentinel("bigint", v.toString()));
    if (t === "undefined")
        return JSON.stringify(UNDEFINED_SENTINEL);
    if (t === "function" || t === "symbol")
        return String(v);
    if (Array.isArray(v)) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const length = v.length;
        const parts = new Array(length);
        for (let i = 0; i < length; i += 1) {
            if (Object.hasOwn(v, i)) {
                parts[i] = _stringify(v[i], stack);
            }
            else {
                parts[i] = HOLE_SENTINEL;
            }
        }
        const out = "[" + parts.join(",") + "]";
        stack.delete(v);
        return out;
    }
    // Date
    if (v instanceof Date) {
        return JSON.stringify(`${DATE_SENTINEL_PREFIX}${v.toISOString()}`);
    }
    // Map
    if (v instanceof Map) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const normalizedEntries = new Map();
        for (const [rawKey, rawValue] of v.entries()) {
            const serializedKey = _stringify(rawKey, stack);
            const revivedKey = reviveFromSerialized(serializedKey);
            const propertyKey = toPropertyKeyString(revivedKey, serializedKey);
            const serializedValue = _stringify(rawValue, stack);
            const revivedValue = reviveFromSerialized(serializedValue);
            normalizedEntries.set(propertyKey, revivedValue);
        }
        const keys = Array.from(normalizedEntries.keys()).sort();
        const body = keys
            .map((key) => {
            const revivedValue = normalizedEntries.get(key);
            return JSON.stringify(key) + ":" + JSON.stringify(revivedValue);
        })
            .join(",");
        stack.delete(v);
        return "{" + body + "}";
    }
    // Set
    if (v instanceof Set) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const serializedValues = Array.from(v.values(), (value) => _stringify(value, stack));
        serializedValues.sort();
        const out = "[" + serializedValues.join(",") + "]";
        stack.delete(v);
        return out;
    }
    // Plain object
    const o = v;
    if (stack.has(o))
        throw new TypeError("Cyclic object");
    stack.add(o);
    const keys = Object.keys(o).sort();
    const body = keys.map((k) => JSON.stringify(k) + ":" + _stringify(o[k], stack));
    stack.delete(o);
    return "{" + body.join(",") + "}";
}
function reviveFromSerialized(serialized) {
    try {
        const parsed = JSON.parse(serialized);
        if (typeof parsed === "string" &&
            parsed.startsWith(STRING_SENTINEL_PREFIX) &&
            parsed.endsWith(SENTINEL_SUFFIX)) {
            return parsed.slice(STRING_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
        }
        return parsed;
    }
    catch {
        if (serialized.startsWith(STRING_SENTINEL_PREFIX) && serialized.endsWith(SENTINEL_SUFFIX)) {
            return serialized.slice(STRING_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
        }
        return serialized;
    }
}
function toPropertyKeyString(value, fallback) {
    if (value === null)
        return "null";
    const type = typeof value;
    if (type === "object" || type === "function") {
        return fallback;
    }
    if (type === "symbol") {
        return value.toString();
    }
    if (type === "string" &&
        value.startsWith(STRING_SENTINEL_PREFIX) &&
        value.endsWith(SENTINEL_SUFFIX)) {
        return value.slice(STRING_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
    }
    return String(value);
}
