// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps are serialized via sentinel-encoded entry lists (keys sorted by canonical property key).
// - Sets are serialized as arrays in insertion order (keys sorted via canonical key string).
const SENTINEL_PREFIX = "\u0000cat32:";
const SENTINEL_SUFFIX = "\u0000";
const HOLE_SENTINEL_PAYLOAD = "__hole__";
const HOLE_SENTINEL_RAW = typeSentinel("hole", HOLE_SENTINEL_PAYLOAD);
const HOLE_SENTINEL = JSON.stringify(HOLE_SENTINEL_RAW);
const UNDEFINED_SENTINEL = "__undefined__";
const DATE_SENTINEL_PREFIX = "__date__:";
const SYMBOL_SENTINEL_PREFIX = "__symbol__:";
const STRING_LITERAL_SENTINEL_PREFIX = "__string__:";
const REGEXP_SENTINEL_TYPE = "regexp";
const MAP_ENTRY_INDEX_LITERAL_SEGMENT = `${STRING_LITERAL_SENTINEL_PREFIX}${SENTINEL_PREFIX}map-entry-index:`;
const MAP_ENTRY_INDEX_SENTINEL_SEGMENT = `${SENTINEL_PREFIX}map-entry-index:`;
const HEX_DIGITS = "0123456789abcdef";
const PROPERTY_KEY_SENTINEL_TYPE = "propertykey";
const MAP_SENTINEL_TYPE = "map";
const OBJECT_TO_STRING = Object.prototype.toString;
function isBigIntObject(value) {
    return (typeof value === "object" &&
        value !== null &&
        OBJECT_TO_STRING.call(value) === "[object BigInt]");
}
const HAS_WEAK_REFS = typeof WeakRef === "function", HAS_FINALIZATION_REGISTRY = typeof FinalizationRegistry === "function";
const LOCAL_SYMBOL_SENTINEL_REGISTRY = new WeakMap(), LOCAL_SYMBOL_OBJECT_REGISTRY = new Map(), LOCAL_SYMBOL_HOLDER_REGISTRY = new Map();
const LOCAL_SYMBOL_IDENTIFIER_INDEX = HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new Map()
    : undefined, LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER = HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new WeakMap()
    : undefined, LOCAL_SYMBOL_FINALIZER = HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new FinalizationRegistry((identifier) => {
        const entry = LOCAL_SYMBOL_IDENTIFIER_INDEX?.get(identifier);
        if (entry === undefined) {
            return;
        }
        LOCAL_SYMBOL_IDENTIFIER_INDEX?.delete(identifier);
        LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER?.delete(entry.holder);
        entry.holder.finalizerToken = undefined;
        LOCAL_SYMBOL_HOLDER_REGISTRY.delete(entry.holder.symbol);
        LOCAL_SYMBOL_OBJECT_REGISTRY.delete(entry.holder.symbol);
    })
    : undefined;
let nextLocalSymbolSentinelId = 0;
function getLocalSymbolHolder(symbol) {
    const existing = LOCAL_SYMBOL_HOLDER_REGISTRY.get(symbol);
    if (existing !== undefined) {
        return existing;
    }
    const target = Object(symbol);
    const holder = { symbol, target };
    LOCAL_SYMBOL_HOLDER_REGISTRY.set(symbol, holder);
    LOCAL_SYMBOL_OBJECT_REGISTRY.set(symbol, target);
    return holder;
}
function peekLocalSymbolSentinelRecordFromObject(symbolObject) {
    return LOCAL_SYMBOL_SENTINEL_REGISTRY.get(symbolObject);
}
function peekLocalSymbolSentinelRecord(symbol) {
    const holder = LOCAL_SYMBOL_HOLDER_REGISTRY.get(symbol);
    if (holder === undefined) {
        return undefined;
    }
    return peekLocalSymbolSentinelRecordFromObject(holder.target);
}
function registerLocalSymbolSentinelRecord(holder, record) {
    LOCAL_SYMBOL_SENTINEL_REGISTRY.set(holder.target, record);
    if (LOCAL_SYMBOL_FINALIZER !== undefined &&
        LOCAL_SYMBOL_IDENTIFIER_INDEX !== undefined &&
        LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER !== undefined) {
        const previousIdentifier = LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER.get(holder);
        if (previousIdentifier !== undefined) {
            LOCAL_SYMBOL_IDENTIFIER_INDEX.delete(previousIdentifier);
        }
        let token = holder.finalizerToken;
        if (token === undefined) {
            token = { holder };
            holder.finalizerToken = token;
        }
        else {
            LOCAL_SYMBOL_FINALIZER.unregister(token);
        }
        const entry = { holder, token };
        LOCAL_SYMBOL_IDENTIFIER_INDEX.set(record.identifier, entry);
        LOCAL_SYMBOL_IDENTIFIER_BY_HOLDER.set(holder, record.identifier);
        LOCAL_SYMBOL_FINALIZER.register(holder.target, record.identifier, token);
    }
}
function createLocalSymbolSentinelRecord(symbol, holder) {
    const identifier = nextLocalSymbolSentinelId.toString(36);
    nextLocalSymbolSentinelId += 1;
    const description = symbol.description ?? "";
    const sentinel = buildLocalSymbolSentinel(identifier, description);
    const record = { identifier, sentinel };
    registerLocalSymbolSentinelRecord(holder, record);
    return record;
}
function getLocalSymbolSentinelRecord(symbol) {
    const holder = getLocalSymbolHolder(symbol);
    const existing = peekLocalSymbolSentinelRecordFromObject(holder.target);
    if (existing !== undefined) {
        return existing;
    }
    return createLocalSymbolSentinelRecord(symbol, holder);
}
function buildLocalSymbolSentinel(identifier, description) {
    const descriptionJson = JSON.stringify(description);
    const payload = `["local","${identifier}",${descriptionJson}]`;
    return `${SYMBOL_SENTINEL_PREFIX}${payload}`;
}
function getSymbolBucketKey(symbol) {
    const globalKey = typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
    if (globalKey !== undefined) {
        return `global:${globalKey}`;
    }
    const record = peekLocalSymbolSentinelRecord(symbol) ??
        getLocalSymbolSentinelRecord(symbol);
    return `local:${record.identifier}`;
}
const STRING_LITERAL_ESCAPED_SENTINEL_TYPES = new Set([
    REGEXP_SENTINEL_TYPE,
    "typedarray",
    "arraybuffer",
    "sharedarraybuffer",
    "number",
    "bigint",
    "hole",
    PROPERTY_KEY_SENTINEL_TYPE,
    "map",
    "set",
]);
const ARRAY_BUFFER_LIKE_SENTINEL_PREFIXES = [
    `${SENTINEL_PREFIX}typedarray:`,
    `${SENTINEL_PREFIX}arraybuffer:`,
    `${SENTINEL_PREFIX}sharedarraybuffer:`,
];
function getDateSentinelParts(date) {
    const time = date.getTime();
    if (!Number.isFinite(time)) {
        const payload = "invalid";
        return { payload, key: `${DATE_SENTINEL_PREFIX}${payload}` };
    }
    const payload = date.toISOString();
    return { payload, key: `${DATE_SENTINEL_PREFIX}${payload}` };
}
function serializeArrayBufferLikeSentinel(type, buffer) {
    const bytes = new Uint8Array(buffer);
    const payload = buildArrayBufferPayload(bytes.length, bytes);
    return stringifySentinelLiteral(typeSentinel(type, payload));
}
function buildTypedArrayPayload(view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const parts = [
        `kind=${getArrayBufferViewTag(view)}`,
        `byteOffset=${view.byteOffset}`,
        `byteLength=${view.byteLength}`,
    ];
    const elementLength = view.length;
    if (typeof elementLength === "number") {
        parts.push(`length=${elementLength}`);
    }
    parts.push(`hex=${toHex(bytes)}`);
    return parts.join(";");
}
function buildArrayBufferPayload(length, bytes) {
    return `byteLength=${length};hex=${toHex(bytes)}`;
}
function getArrayBufferViewTag(view) {
    const raw = Object.prototype.toString.call(view);
    return raw.slice(8, -1);
}
function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        out += HEX_DIGITS[(byte >> 4) & 0xf];
        out += HEX_DIGITS[byte & 0xf];
    }
    return out;
}
const sharedArrayBufferGlobal = globalThis;
const sharedArrayBufferCtor = typeof sharedArrayBufferGlobal.SharedArrayBuffer === "function"
    ? sharedArrayBufferGlobal.SharedArrayBuffer
    : undefined;
export function typeSentinel(type, payload = "") {
    return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}
function buildRegExpPayload(value) {
    return JSON.stringify([value.source, value.flags]);
}
function buildRegExpSentinel(value) {
    return typeSentinel(REGEXP_SENTINEL_TYPE, buildRegExpPayload(value));
}
export function escapeSentinelString(value) {
    return normalizeStringLiteral(value);
}
export function stableStringify(v) {
    const stack = new Set();
    return _stringify(v, stack);
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
    if (t === "symbol") {
        return stringifySentinelLiteral(toSymbolSentinel(v));
    }
    if (t === "function")
        return String(v);
    if (v instanceof Number || v instanceof Boolean || isBigIntObject(v)) {
        return _stringify(v.valueOf(), stack);
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
        const { key } = getDateSentinelParts(v);
        return stringifySentinelLiteral(key);
    }
    if (ArrayBuffer.isView(v)) {
        const view = v;
        return stringifySentinelLiteral(typeSentinel("typedarray", buildTypedArrayPayload(view)));
    }
    if (sharedArrayBufferCtor && v instanceof sharedArrayBufferCtor) {
        return serializeArrayBufferLikeSentinel("sharedarraybuffer", v);
    }
    if (v instanceof ArrayBuffer) {
        return serializeArrayBufferLikeSentinel("arraybuffer", v);
    }
    // Map
    if (v instanceof Map) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const normalizedEntries = Object.create(null);
        for (const [rawKey, rawValue] of v.entries()) {
            const serializedKey = _stringify(rawKey, stack);
            const { bucketKey, propertyKey } = toMapPropertyKey(rawKey, serializedKey);
            const serializedValue = _stringify(rawValue, stack);
            const bucket = normalizedEntries[bucketKey];
            const rawKeyIsSymbol = typeof rawKey === "symbol";
            const shouldDedupeByType = rawKeyIsSymbol ? bucket !== undefined : true;
            if (bucket) {
                const hasDuplicatePropertyKey = bucket.entries.some((entry) => entry.propertyKey === propertyKey);
                bucket.entries.push({
                    serializedKey,
                    serializedValue,
                    order: bucket.entries.length,
                    propertyKey,
                });
                if (hasDuplicatePropertyKey) {
                    bucket.hasDuplicatePropertyKey = true;
                }
                if (shouldDedupeByType) {
                    bucket.shouldDedupeByType = true;
                }
                else {
                    bucket.shouldDedupeByType = false;
                }
            }
            else {
                normalizedEntries[bucketKey] = {
                    propertyKey,
                    entries: [
                        {
                            serializedKey,
                            serializedValue,
                            order: 0,
                            propertyKey,
                        },
                    ],
                    shouldDedupeByType,
                    hasDuplicatePropertyKey: false,
                };
            }
        }
        const serializedEntries = [];
        const sortedKeys = Object.keys(normalizedEntries).sort((leftKey, rightKey) => {
            const left = normalizedEntries[leftKey];
            const right = normalizedEntries[rightKey];
            if (left.propertyKey === right.propertyKey) {
                if (leftKey < rightKey)
                    return -1;
                if (leftKey > rightKey)
                    return 1;
                return 0;
            }
            return left.propertyKey < right.propertyKey ? -1 : 1;
        });
        for (const key of sortedKeys) {
            const bucket = normalizedEntries[key];
            if (!bucket?.entries.length)
                continue;
            const entries = bucket.entries;
            entries.sort(compareSerializedEntry);
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];
                const propertyKey = mapEntryPropertyKey(bucket.propertyKey, entry.propertyKey, index, entries.length, entry.order, bucket.shouldDedupeByType, bucket.hasDuplicatePropertyKey);
                serializedEntries.push([propertyKey, entry.serializedValue]);
            }
        }
        stack.delete(v);
        const payload = JSON.stringify(serializedEntries);
        return stringifySentinelLiteral(typeSentinel(MAP_SENTINEL_TYPE, payload));
    }
    // Set
    if (v instanceof Set) {
        if (stack.has(v))
            throw new TypeError("Cyclic object");
        stack.add(v);
        const entries = [];
        for (const value of v.values()) {
            const serializedValue = _stringify(value, stack);
            entries.push({
                sortKey: buildSetSortKey(value, serializedValue),
                serializedValue,
            });
        }
        entries.sort((left, right) => {
            if (left.sortKey < right.sortKey)
                return -1;
            if (left.sortKey > right.sortKey)
                return 1;
            if (left.serializedValue < right.serializedValue)
                return -1;
            if (left.serializedValue > right.serializedValue)
                return 1;
            return 0;
        });
        const body = entries.map((entry) => entry.serializedValue);
        const payload = "[" + body.join(",") + "]";
        const out = stringifySentinelLiteral(typeSentinel("set", payload));
        stack.delete(v);
        return out;
    }
    if (v instanceof RegExp) {
        return stringifySentinelLiteral(buildRegExpSentinel(v));
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
    if (left.order < right.order)
        return -1;
    if (left.order > right.order)
        return 1;
    return 0;
}
function mapEntryPropertyKey(bucketKey, entryPropertyKey, entryIndex, totalEntries, entryOrder, shouldDedupeByType, hasDuplicatePropertyKey) {
    const isLocalSymbolProperty = entryPropertyKey.startsWith(`${SYMBOL_SENTINEL_PREFIX}["local"`);
    if (!shouldDedupeByType && isLocalSymbolProperty) {
        const uniqueIndex = hasDuplicatePropertyKey ? entryOrder : entryIndex;
        const payload = JSON.stringify([bucketKey, entryPropertyKey, uniqueIndex]);
        return typeSentinel("map-entry-index", payload);
    }
    if (totalEntries <= 1 ||
        (!hasDuplicatePropertyKey && entryIndex === 0)) {
        return entryPropertyKey;
    }
    const uniqueIndex = hasDuplicatePropertyKey ? entryOrder : entryIndex;
    const payload = JSON.stringify([bucketKey, entryPropertyKey, uniqueIndex]);
    return typeSentinel("map-entry-index", payload);
}
function mapBucketTypeTag(rawKey) {
    if (rawKey instanceof Number ||
        rawKey instanceof Boolean ||
        isBigIntObject(rawKey)) {
        return mapBucketTypeTag(rawKey.valueOf());
    }
    if (typeof rawKey === "symbol")
        return "symbol";
    if (rawKey === null)
        return "null";
    if (rawKey instanceof Date)
        return "date";
    if (rawKey instanceof Map)
        return "map";
    if (rawKey instanceof Set)
        return "set";
    if (rawKey instanceof RegExp)
        return REGEXP_SENTINEL_TYPE;
    if (Array.isArray(rawKey))
        return "array";
    if (sharedArrayBufferCtor && rawKey instanceof sharedArrayBufferCtor)
        return "sharedarraybuffer";
    if (rawKey instanceof ArrayBuffer || ArrayBuffer.isView(rawKey))
        return "arraybuffer";
    return typeof rawKey;
}
const NULL_PROPERTY_KEY_SENTINEL_BUCKET_TAG = mapBucketTypeTag(null);
function buildNullPropertyKeySentinel(serializedKey) {
    return typeSentinel(PROPERTY_KEY_SENTINEL_TYPE, JSON.stringify([NULL_PROPERTY_KEY_SENTINEL_BUCKET_TAG, serializedKey]));
}
function buildPropertyKeySentinel(rawKey, serializedKey, stringified) {
    const bucketTag = mapBucketTypeTag(rawKey);
    const payloadParts = [bucketTag, serializedKey];
    if (stringified !== undefined) {
        payloadParts.push(stringified);
    }
    return typeSentinel(PROPERTY_KEY_SENTINEL_TYPE, JSON.stringify(payloadParts));
}
function toMapPropertyKey(rawKey, serializedKey) {
    const bucketTag = mapBucketTypeTag(rawKey);
    const revivedKey = reviveFromSerialized(serializedKey);
    if (rawKey instanceof Date) {
        const propertyKey = toPropertyKeyString(rawKey, revivedKey, serializedKey);
        return {
            bucketKey: `${bucketTag}|${propertyKey}`,
            propertyKey,
        };
    }
    const propertyKey = toPropertyKeyString(rawKey, revivedKey, serializedKey);
    if (typeof rawKey === "symbol") {
        return {
            bucketKey: `${bucketTag}|${getSymbolBucketKey(rawKey)}`,
            propertyKey,
        };
    }
    if (rawKey instanceof RegExp) {
        return {
            bucketKey: `${bucketTag}|${propertyKey}`,
            propertyKey,
        };
    }
    return {
        bucketKey: `${bucketTag}|${serializedKey}`,
        propertyKey,
    };
}
function stringifyStringLiteral(value) {
    return JSON.stringify(normalizeStringLiteral(value));
}
function normalizeStringLiteral(value) {
    if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
        if (needsStringLiteralSentinelEscape(value)) {
            return `${STRING_LITERAL_SENTINEL_PREFIX}${value}`;
        }
        let innerValue = value.slice(STRING_LITERAL_SENTINEL_PREFIX.length);
        while (innerValue.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
            innerValue = innerValue.slice(STRING_LITERAL_SENTINEL_PREFIX.length);
        }
        if (needsNestedStringLiteralSentinelEscape(innerValue)) {
            if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX.repeat(2))) {
                return value;
            }
            return `${STRING_LITERAL_SENTINEL_PREFIX}${value}`;
        }
        return value;
    }
    if (needsStringLiteralSentinelEscape(value)) {
        return `${STRING_LITERAL_SENTINEL_PREFIX}${value}`;
    }
    return value;
}
function needsNestedStringLiteralSentinelEscape(value) {
    if (needsStringLiteralSentinelEscape(value)) {
        return true;
    }
    return value.startsWith(STRING_LITERAL_SENTINEL_PREFIX);
}
function hasArrayBufferLikeSentinelPrefix(value) {
    for (const prefix of ARRAY_BUFFER_LIKE_SENTINEL_PREFIXES) {
        if (value.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}
function needsStringLiteralSentinelEscape(value) {
    if (value === HOLE_SENTINEL_RAW) {
        return true;
    }
    if (value === UNDEFINED_SENTINEL) {
        return true;
    }
    if (value.startsWith(SYMBOL_SENTINEL_PREFIX)) {
        return true;
    }
    if (value.startsWith(DATE_SENTINEL_PREFIX)) {
        return true;
    }
    if (hasArrayBufferLikeSentinelPrefix(value)) {
        return true;
    }
    if (value.startsWith(SENTINEL_PREFIX) &&
        value.endsWith(SENTINEL_SUFFIX)) {
        const inner = value.slice(SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
        const separatorIndex = inner.indexOf(":");
        if (separatorIndex !== -1) {
            const type = inner.slice(0, separatorIndex);
            if (STRING_LITERAL_ESCAPED_SENTINEL_TYPES.has(type)) {
                return true;
            }
        }
    }
    if (value.includes(MAP_ENTRY_INDEX_LITERAL_SEGMENT)) {
        return true;
    }
    if (value.includes(MAP_ENTRY_INDEX_SENTINEL_SEGMENT)) {
        return true;
    }
    return false;
}
function stripStringLiteralSentinelPrefix(value) {
    if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
        return value.slice(STRING_LITERAL_SENTINEL_PREFIX.length);
    }
    return value;
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
        value.startsWith(DATE_SENTINEL_PREFIX)) {
        const payload = value.slice(DATE_SENTINEL_PREFIX.length);
        if (payload === "invalid") {
            return new Date(Number.NaN);
        }
        const revivedDate = new Date(payload);
        if (Number.isFinite(revivedDate.getTime())) {
            return revivedDate;
        }
        return value;
    }
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
            if (type === REGEXP_SENTINEL_TYPE) {
                try {
                    const parsed = JSON.parse(payload);
                    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
                        const flags = typeof parsed[1] === "string" ? parsed[1] : "";
                        return new RegExp(parsed[0], flags);
                    }
                }
                catch {
                    return value;
                }
                return value;
            }
        }
    }
    return value;
}
function toSymbolSentinel(symbol) {
    const globalKey = typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
    if (globalKey !== undefined) {
        const payload = JSON.stringify(["global", globalKey]);
        return `${SYMBOL_SENTINEL_PREFIX}${payload}`;
    }
    const record = getLocalSymbolSentinelRecord(symbol);
    return record.sentinel;
}
function getSymbolSortKey(symbol) {
    const globalKey = typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
    if (globalKey !== undefined) {
        return `global:${globalKey}`;
    }
    const record = peekLocalSymbolSentinelRecord(symbol) ??
        getLocalSymbolSentinelRecord(symbol);
    return `local:${record.identifier}`;
}
export { getLocalSymbolSentinelRecord as __getLocalSymbolSentinelRecordForTest, peekLocalSymbolSentinelRecord as __peekLocalSymbolSentinelRecordForTest, };
function buildSetSortKey(value, serializedValue) {
    if (typeof value === "symbol") {
        return getSymbolSortKey(value);
    }
    return serializedValue;
}
function toPropertyKeyString(rawKey, revivedKey, serializedKey) {
    if (rawKey instanceof Number ||
        rawKey instanceof Boolean ||
        isBigIntObject(rawKey)) {
        return toPropertyKeyString(rawKey.valueOf(), revivedKey, serializedKey);
    }
    if (typeof rawKey === "symbol") {
        return toSymbolSentinel(rawKey);
    }
    if (rawKey === null) {
        return buildNullPropertyKeySentinel(serializedKey);
    }
    if (rawKey instanceof Date) {
        if (typeof revivedKey === "string" &&
            revivedKey.startsWith(DATE_SENTINEL_PREFIX)) {
            return escapeSentinelString(revivedKey);
        }
        const { key } = getDateSentinelParts(rawKey);
        return key;
    }
    if (rawKey instanceof RegExp) {
        const normalizedFromRaw = stripStringLiteralSentinelPrefix(normalizePlainObjectKey(escapeSentinelString(buildRegExpSentinel(rawKey))));
        if (revivedKey instanceof RegExp) {
            return stripStringLiteralSentinelPrefix(normalizePlainObjectKey(escapeSentinelString(buildRegExpSentinel(revivedKey))));
        }
        if (typeof revivedKey === "string") {
            const normalizedRevived = normalizePlainObjectKey(escapeSentinelString(revivedKey));
            if (normalizedRevived !== normalizedFromRaw) {
                return normalizedRevived;
            }
        }
        return normalizedFromRaw;
    }
    const rawType = typeof rawKey;
    if (rawType === "string") {
        return normalizePlainObjectKey(rawKey);
    }
    if (rawType === "number" ||
        rawType === "bigint" ||
        rawType === "boolean" ||
        rawType === "undefined") {
        return buildPropertyKeySentinel(rawKey, serializedKey);
    }
    if (rawType === "object" || rawType === "function") {
        let stringified;
        try {
            stringified = String(rawKey);
        }
        catch {
            stringified = undefined;
        }
        const propertyKeySentinel = buildPropertyKeySentinel(rawKey, serializedKey, stringified);
        if (typeof revivedKey === "string") {
            if (needsStringLiteralSentinelEscape(revivedKey)) {
                return propertyKeySentinel;
            }
            const normalizedRevived = normalizePlainObjectKey(escapeSentinelString(revivedKey));
            if (normalizedRevived !== propertyKeySentinel) {
                return normalizedRevived;
            }
        }
        return propertyKeySentinel;
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
    return normalizeStringLiteral(key);
}
