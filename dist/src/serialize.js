// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps/Sets are serialized as arrays in insertion order (keys sorted for Map via key string).
const SENTINEL_PREFIX = "\u0000cat32:";
const SENTINEL_SUFFIX = "\u0000";
const HOLE_SENTINEL = JSON.stringify(typeSentinel("hole"));
const UNDEFINED_SENTINEL = "__undefined__";
const DATE_SENTINEL_PREFIX = "__date__:";
const BIGINT_SENTINEL_PREFIX = "__bigint__:";
const NUMBER_SENTINEL_PREFIX = "__number__:";
const STRING_LITERAL_SENTINEL_PREFIX = "__string__:";
export function typeSentinel(type, payload = "") {
    return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}
export function escapeSentinelString(value) {
    return value;
}
export function stableStringify(v) {
    const stack = new Set();
    return _stringify(v, stack);
}
function isSentinelWrappedString(value) {
    return value.startsWith(SENTINEL_PREFIX) && value.endsWith(SENTINEL_SUFFIX);
}
function _stringify(v, stack) {
    if (v === null)
        return "null";
    const t = typeof v;
    if (t === "string") {
        const value = v;
        return stringifyStringLiteral(value);
    }
    if (t === "number") {
        const value = v;
        if (Number.isNaN(value) || !Number.isFinite(value)) {
            return stringifySentinelLiteral(typeSentinel("number", String(value)));
        }
        return JSON.stringify(value);
    }
    if (t === "boolean")
        return JSON.stringify(v);
    if (t === "bigint")
        return stringifySentinelLiteral(typeSentinel("bigint", v.toString()));
    if (t === "undefined")
        return stringifySentinelLiteral(UNDEFINED_SENTINEL);
    if (t === "function" || t === "symbol") {
        return String(v);
    }
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
        return stringifySentinelLiteral(`${DATE_SENTINEL_PREFIX}${v.toISOString()}`);
    }
    // Map
    if (v instanceof Map) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const normalizedEntries = Object.create(null);
        const dedupeByKey = Object.create(null);
        for (const [rawKey, rawValue] of v.entries()) {
            const serializedKey = _stringify(rawKey, stack);
            const propertyKey = toMapPropertyKey(rawKey, serializedKey);
            const serializedValue = _stringify(rawValue, stack);
            const candidate = { serializedKey, serializedValue };
            const shouldDedupe = typeof rawKey !== "symbol";
            const bucket = normalizedEntries[propertyKey];
            if (bucket) {
                bucket.push(candidate);
                dedupeByKey[propertyKey] = (dedupeByKey[propertyKey] ?? true) && shouldDedupe;
            }
            else {
                normalizedEntries[propertyKey] = [candidate];
                dedupeByKey[propertyKey] = shouldDedupe;
            }
        }
        const sortedKeys = Object.keys(normalizedEntries).sort();
        const bodyParts = [];
        for (let i = 0; i < sortedKeys.length; i += 1) {
            const key = sortedKeys[i];
            const bucket = normalizedEntries[key];
            if (!bucket || bucket.length === 0) {
                continue;
            }
            bucket.sort(compareSerializedEntry);
            const entriesToEmit = dedupeByKey[key] ? [bucket[0]] : bucket;
            for (let j = 0; j < entriesToEmit.length; j += 1) {
                const entry = entriesToEmit[j];
                if (bodyParts.length > 0) {
                    bodyParts.push(",");
                }
                bodyParts.push(JSON.stringify(key));
                bodyParts.push(":");
                bodyParts.push(entry.serializedValue);
            }
        }
        stack.delete(v);
        return "{" + bodyParts.join("") + "}";
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
    const target = o;
    const enumerableSymbols = Object.getOwnPropertySymbols(o).filter((symbol) => Object.prototype.propertyIsEnumerable.call(o, symbol));
    const entries = [];
    for (const key of Object.keys(o)) {
        entries.push({
            sortKey: key,
            normalizedKey: normalizePlainObjectKey(key),
            property: key,
        });
    }
    for (const symbol of enumerableSymbols) {
        const symbolString = toPropertyKeyString(symbol, symbol, symbol.toString());
        entries.push({
            sortKey: symbolString,
            normalizedKey: symbolString,
            property: symbol,
        });
    }
    entries.sort((a, b) => {
        if (a.sortKey < b.sortKey)
            return -1;
        if (a.sortKey > b.sortKey)
            return 1;
        return 0;
    });
    const body = entries.map(({ normalizedKey, property }) => JSON.stringify(normalizedKey) + ":" + _stringify(target[property], stack));
    stack.delete(o);
    return "{" + body.join(",") + "}";
}
function compareSerializedEntry(left, right) {
    if (left.serializedKey < right.serializedKey)
        return -1;
    if (left.serializedKey > right.serializedKey)
        return 1;
    if (left.serializedValue < right.serializedValue)
        return -1;
    if (left.serializedValue > right.serializedValue)
        return 1;
    return 0;
}
function toMapPropertyKey(rawKey, serializedKey) {
    const revivedKey = reviveFromSerialized(serializedKey);
    return toPropertyKeyString(rawKey, revivedKey, serializedKey);
}
function stringifyStringLiteral(value) {
    return JSON.stringify(value);
}
function stringifySentinelLiteral(value) {
    if (typeof value !== "string") {
        throw new TypeError("Sentinel literal must be a string");
    }
    return JSON.stringify(value);
}
function reviveFromSerialized(serialized) {
    let revived;
    try {
        revived = reviveSentinelValue(JSON.parse(serialized));
    }
    catch {
        revived = reviveSentinelValue(serialized);
    }
    const numeric = reviveNumericSentinel(revived);
    if (numeric !== undefined) {
        return numeric;
    }
    const fallbackNumeric = reviveNumericSentinel(serialized);
    if (fallbackNumeric !== undefined) {
        return fallbackNumeric;
    }
    return revived;
}
function reviveSentinelValue(value) {
    if (typeof value === "string" &&
        value.startsWith(SENTINEL_PREFIX) &&
        value.endsWith(SENTINEL_SUFFIX)) {
        const inner = value.slice(SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
        const separatorIndex = inner.indexOf(":");
        if (separatorIndex !== -1) {
            const type = inner.slice(0, separatorIndex);
            const payload = inner.slice(separatorIndex + 1);
            if (type === "string") {
                return payload;
            }
            if (type === "number") {
                if (payload === "Infinity")
                    return Number.POSITIVE_INFINITY;
                if (payload === "-Infinity")
                    return Number.NEGATIVE_INFINITY;
                if (payload === "NaN")
                    return Number.NaN;
                return Number(payload);
            }
            if (type === "bigint") {
                try {
                    return BigInt(payload);
                }
                catch {
                    return value;
                }
            }
        }
    }
    return value;
}
function toPropertyKeyString(rawKey, revivedKey, serializedKey) {
    if (typeof rawKey === "symbol") {
        return rawKey.toString();
    }
    if (rawKey === null) {
        return "null";
    }
    if (rawKey instanceof Date) {
        if (typeof revivedKey === "string") {
            return escapeSentinelString(revivedKey);
        }
        return `${DATE_SENTINEL_PREFIX}${rawKey.toISOString()}`;
    }
    const rawType = typeof rawKey;
    if (rawType === "string") {
        return normalizePlainObjectKey(rawKey);
    }
    if (rawType === "number" ||
        rawType === "bigint" ||
        rawType === "boolean") {
        return String(rawKey);
    }
    if (rawType === "undefined") {
        return "undefined";
    }
    if (rawType === "object" || rawType === "function") {
        let stringified;
        try {
            stringified = String(rawKey);
        }
        catch {
            stringified = undefined;
        }
        if (stringified !== undefined) {
            const normalizedString = normalizePlainObjectKey(stringified);
            if (typeof revivedKey === "string") {
                const normalizedRevived = normalizePlainObjectKey(escapeSentinelString(revivedKey));
                if (normalizedRevived !== normalizedString) {
                    return normalizedRevived;
                }
            }
            return normalizedString;
        }
    }
    if (typeof revivedKey === "string") {
        return normalizePlainObjectKey(escapeSentinelString(revivedKey));
    }
    return normalizePlainObjectKey(escapeSentinelString(String(revivedKey ?? serializedKey)));
}
function reviveNumericSentinel(value) {
    if (typeof value === "number" || typeof value === "bigint") {
        return value;
    }
    if (typeof value === "string" &&
        value.startsWith(SENTINEL_PREFIX) &&
        value.endsWith(SENTINEL_SUFFIX)) {
        const revived = reviveSentinelValue(value);
        if (typeof revived === "number" || typeof revived === "bigint") {
            return revived;
        }
    }
    return undefined;
}
function normalizePlainObjectKey(key) {
    return key;
}
