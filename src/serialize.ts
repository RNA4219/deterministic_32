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
const MAP_ENTRY_INDEX_LITERAL_SEGMENT =
  `${STRING_LITERAL_SENTINEL_PREFIX}${SENTINEL_PREFIX}map-entry-index:`;
const MAP_ENTRY_INDEX_SENTINEL_SEGMENT = `${SENTINEL_PREFIX}map-entry-index:`;
const HEX_DIGITS = "0123456789abcdef";
const PROPERTY_KEY_SENTINEL_TYPE = "propertykey";
const MAP_SENTINEL_TYPE = "map";

const OBJECT_TO_STRING = Object.prototype.toString;

function isBigIntObject(value: unknown): value is { valueOf(): bigint } {
  return (
    typeof value === "object" &&
    value !== null &&
    OBJECT_TO_STRING.call(value) === "[object BigInt]"
  );
}

type ValueOfCapable = { valueOf(): unknown };

type LocalSymbolWeakTarget = symbol & object;

type LocalSymbolFinalizerTarget = Record<string, never>;

type LocalSymbolFinalizerHolder = {
  target: LocalSymbolWeakTarget;
  ref: WeakRef<LocalSymbolWeakTarget>;
};

type LocalSymbolSentinelRecord = {
  identifier: string;
  sentinel: string;
  finalizerHolder?: LocalSymbolFinalizerHolder;
};

const HAS_WEAK_REFS = typeof WeakRef === "function";
const HAS_FINALIZATION_REGISTRY = typeof FinalizationRegistry === "function";

const LOCAL_SYMBOL_SENTINEL_REGISTRY =
  new WeakMap<LocalSymbolWeakTarget, LocalSymbolSentinelRecord>();
const LOCAL_SYMBOL_OBJECT_REGISTRY = new Map<symbol, LocalSymbolWeakTarget>();
const LOCAL_SYMBOL_IDENTIFIER_INDEX =
  HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new Map<string, WeakRef<LocalSymbolFinalizerHolder>>()
    : undefined;
const LOCAL_SYMBOL_FINALIZER_TARGET_INDEX =
  HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new WeakMap<LocalSymbolWeakTarget, LocalSymbolFinalizerTarget>()
    : undefined;
const LOCAL_SYMBOL_FINALIZER =
  HAS_WEAK_REFS && HAS_FINALIZATION_REGISTRY
    ? new FinalizationRegistry<string>((identifier) => {
        LOCAL_SYMBOL_IDENTIFIER_INDEX?.delete(identifier);
      })
    : undefined;

let nextLocalSymbolSentinelId = 0;

function getOrCreateSymbolObject(symbol: symbol): LocalSymbolWeakTarget {
  const existing = LOCAL_SYMBOL_OBJECT_REGISTRY.get(symbol);
  if (existing !== undefined) {
    return existing;
  }

  const target = Object(symbol) as LocalSymbolWeakTarget;
  LOCAL_SYMBOL_OBJECT_REGISTRY.set(symbol, target);
  return target;
}

function peekLocalSymbolSentinelRecordFromObject(
  symbolObject: LocalSymbolWeakTarget,
): LocalSymbolSentinelRecord | undefined {
  return LOCAL_SYMBOL_SENTINEL_REGISTRY.get(symbolObject);
}

function peekLocalSymbolSentinelRecord(
  symbol: symbol,
): LocalSymbolSentinelRecord | undefined {
  const symbolObject = LOCAL_SYMBOL_OBJECT_REGISTRY.get(symbol);
  if (symbolObject === undefined) {
    return undefined;
  }

  return peekLocalSymbolSentinelRecordFromObject(symbolObject);
}

function registerLocalSymbolSentinelRecord(
  symbolObject: LocalSymbolWeakTarget,
  record: LocalSymbolSentinelRecord,
): void {
  if (
    LOCAL_SYMBOL_IDENTIFIER_INDEX !== undefined &&
    LOCAL_SYMBOL_FINALIZER !== undefined &&
    LOCAL_SYMBOL_FINALIZER_TARGET_INDEX !== undefined
  ) {
    let finalizerTarget = LOCAL_SYMBOL_FINALIZER_TARGET_INDEX.get(symbolObject);
    if (finalizerTarget === undefined) {
      finalizerTarget = {} as LocalSymbolFinalizerTarget;
      LOCAL_SYMBOL_FINALIZER_TARGET_INDEX.set(symbolObject, finalizerTarget);
    }

    const ref = new WeakRef(symbolObject);
    const holder: LocalSymbolFinalizerHolder = { target: symbolObject, ref };
    const holderRef = new WeakRef(holder);
    LOCAL_SYMBOL_IDENTIFIER_INDEX.set(record.identifier, holderRef);
    LOCAL_SYMBOL_FINALIZER.register(finalizerTarget, record.identifier);
    record.finalizerHolder = holder;
  }

  LOCAL_SYMBOL_SENTINEL_REGISTRY.set(symbolObject, record);
}

function createLocalSymbolSentinelRecord(
  symbol: symbol,
  symbolObject: LocalSymbolWeakTarget,
): LocalSymbolSentinelRecord {
  const identifier = nextLocalSymbolSentinelId.toString(36);
  nextLocalSymbolSentinelId += 1;

  const description = symbol.description ?? "";
  const sentinel = buildLocalSymbolSentinel(identifier, description);
  const record: LocalSymbolSentinelRecord = { identifier, sentinel };

  registerLocalSymbolSentinelRecord(symbolObject, record);
  return record;
}

function getLocalSymbolSentinelRecord(
  symbol: symbol,
): LocalSymbolSentinelRecord {
  const symbolObject = getOrCreateSymbolObject(symbol);
  const existing = peekLocalSymbolSentinelRecordFromObject(symbolObject);
  if (existing !== undefined) {
    return existing;
  }

  return createLocalSymbolSentinelRecord(symbol, symbolObject);
}

function buildLocalSymbolSentinel(
  identifier: string,
  description: string,
): string {
  const descriptionJson = JSON.stringify(description);
  const payload = `["local","${identifier}",${descriptionJson}]`;
  return `${SYMBOL_SENTINEL_PREFIX}${payload}`;
}

function getSymbolBucketKey(symbol: symbol): string {
  const globalKey =
    typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
  if (globalKey !== undefined) {
    return `global:${globalKey}`;
  }
  const record =
    peekLocalSymbolSentinelRecord(symbol) ??
    getLocalSymbolSentinelRecord(symbol);
  return `local:${record.identifier}`;
}

const STRING_LITERAL_ESCAPED_SENTINEL_TYPES = new Set<string>([
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
] as const;

type DateSentinelParts = {
  payload: string;
  key: string;
};

function getDateSentinelParts(date: Date): DateSentinelParts {
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    const payload = "invalid";
    return { payload, key: `${DATE_SENTINEL_PREFIX}${payload}` };
  }
  const payload = date.toISOString();
  return { payload, key: `${DATE_SENTINEL_PREFIX}${payload}` };
}

function serializeArrayBufferLikeSentinel(
  type: string,
  buffer: ArrayBufferLike,
): string {
  const bytes = new Uint8Array(buffer);
  const payload = buildArrayBufferPayload(bytes.length, bytes);
  return stringifySentinelLiteral(typeSentinel(type, payload));
}

function buildTypedArrayPayload(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const parts = [
    `kind=${getArrayBufferViewTag(view)}`,
    `byteOffset=${view.byteOffset}`,
    `byteLength=${view.byteLength}`,
  ];
  const elementLength = (view as { length?: number }).length;
  if (typeof elementLength === "number") {
    parts.push(`length=${elementLength}`);
  }
  parts.push(`hex=${toHex(bytes)}`);
  return parts.join(";");
}

function buildArrayBufferPayload(length: number, bytes: Uint8Array): string {
  return `byteLength=${length};hex=${toHex(bytes)}`;
}

function getArrayBufferViewTag(view: ArrayBufferView): string {
  const raw = Object.prototype.toString.call(view);
  return raw.slice(8, -1);
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    out += HEX_DIGITS[(byte >> 4) & 0xf];
    out += HEX_DIGITS[byte & 0xf];
  }
  return out;
}

type ArrayBufferLikeConstructor = {
  new (...args: unknown[]): ArrayBufferLike;
  prototype: ArrayBufferLike;
};

const sharedArrayBufferGlobal = globalThis as unknown as {
  SharedArrayBuffer?: ArrayBufferLikeConstructor;
};

const sharedArrayBufferCtor =
  typeof sharedArrayBufferGlobal.SharedArrayBuffer === "function"
    ? sharedArrayBufferGlobal.SharedArrayBuffer
    : undefined;

export function typeSentinel(type: string, payload = ""): string {
  return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}

function buildRegExpPayload(value: RegExp): string {
  return JSON.stringify([value.source, value.flags]);
}

function buildRegExpSentinel(value: RegExp): string {
  return typeSentinel(REGEXP_SENTINEL_TYPE, buildRegExpPayload(value));
}

export function escapeSentinelString(value: string): string {
  return normalizeStringLiteral(value);
}

export function stableStringify(v: unknown): string {
  const stack = new Set<unknown>();
  return _stringify(v, stack);
}

function _stringify(v: unknown, stack: Set<unknown>): string {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "string") {
    const value = v as string;
    return stringifyStringLiteral(value);
  }
  if (t === "number") {
    const value = v as number;
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return stringifySentinelLiteral(typeSentinel("number", String(value)));
    }
    return JSON.stringify(value);
  }
  if (t === "boolean") return JSON.stringify(v);
  if (t === "bigint") return stringifySentinelLiteral(typeSentinel("bigint", (v as bigint).toString()));
  if (t === "undefined") return stringifySentinelLiteral(UNDEFINED_SENTINEL);
  if (t === "symbol") {
    return stringifySentinelLiteral(toSymbolSentinel(v as symbol));
  }
  if (t === "function") return String(v);

  if (v instanceof Number || v instanceof Boolean || isBigIntObject(v)) {
    return _stringify(
      (v as ValueOfCapable).valueOf(),
      stack,
    );
  }

  if (Array.isArray(v)) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const length = v.length;
    const parts: string[] = new Array(length);
    for (let i = 0; i < length; i += 1) {
      if (Object.hasOwn(v, i)) {
        parts[i] = _stringify(v[i], stack);
      } else {
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
    const view = v as ArrayBufferView;
    return stringifySentinelLiteral(
      typeSentinel("typedarray", buildTypedArrayPayload(view)),
    );
  }

  if (sharedArrayBufferCtor && v instanceof sharedArrayBufferCtor) {
    return serializeArrayBufferLikeSentinel("sharedarraybuffer", v);
  }

  if (v instanceof ArrayBuffer) {
    return serializeArrayBufferLikeSentinel("arraybuffer", v);
  }

  // Map
  if (v instanceof Map) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    type SerializedEntry = {
      serializedKey: string;
      serializedValue: string;
      order: number;
      propertyKey: string;
    };
    const normalizedEntries: Record<
      string,
      {
        propertyKey: string;
        entries: SerializedEntry[];
        shouldDedupeByType: boolean;
        hasDuplicatePropertyKey: boolean;
      }
    > = Object.create(null);
    for (const [rawKey, rawValue] of v.entries()) {
      const serializedKey = _stringify(rawKey, stack);
      const { bucketKey, propertyKey } = toMapPropertyKey(rawKey, serializedKey);
      const serializedValue = _stringify(rawValue, stack);
      const bucket = normalizedEntries[bucketKey];
      const rawKeyIsSymbol = typeof rawKey === "symbol";
      const shouldDedupeByType = rawKeyIsSymbol ? bucket !== undefined : true;
      if (bucket) {
        const hasDuplicatePropertyKey = bucket.entries.some(
          (entry) => entry.propertyKey === propertyKey,
        );
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
        } else {
          bucket.shouldDedupeByType = false;
        }
      } else {
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
    const serializedEntries: Array<[string, string]> = [];
    const sortedKeys = Object.keys(normalizedEntries).sort((leftKey, rightKey) => {
      const left = normalizedEntries[leftKey]!;
      const right = normalizedEntries[rightKey]!;
      if (left.propertyKey === right.propertyKey) {
        if (leftKey < rightKey) return -1;
        if (leftKey > rightKey) return 1;
        return 0;
      }
      return left.propertyKey < right.propertyKey ? -1 : 1;
    });
    for (const key of sortedKeys) {
      const bucket = normalizedEntries[key];
      if (!bucket?.entries.length) continue;
      const entries = bucket.entries;
      entries.sort(compareSerializedEntry);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!;
        const propertyKey = mapEntryPropertyKey(
          bucket.propertyKey,
          entry.propertyKey,
          index,
          entries.length,
          entry.order,
          bucket.shouldDedupeByType,
          bucket.hasDuplicatePropertyKey,
        );
        serializedEntries.push([propertyKey, entry.serializedValue]);
      }
    }
    stack.delete(v);
    const payload = JSON.stringify(serializedEntries);
    return stringifySentinelLiteral(typeSentinel(MAP_SENTINEL_TYPE, payload));
  }

  // Set
  if (v instanceof Set) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    type SerializedSetEntry = { sortKey: string; serializedValue: string };
    const entries: SerializedSetEntry[] = [];
    for (const value of v.values()) {
      const serializedValue = _stringify(value, stack);
      entries.push({
        sortKey: buildSetSortKey(value, serializedValue),
        serializedValue,
      });
    }
    entries.sort((left, right) => {
      if (left.sortKey < right.sortKey) return -1;
      if (left.sortKey > right.sortKey) return 1;
      if (left.serializedValue < right.serializedValue) return -1;
      if (left.serializedValue > right.serializedValue) return 1;
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
  const o = v as Record<string, unknown>;
  if (stack.has(o)) throw new TypeError("Cyclic object");
  stack.add(o);
  const target = o as Record<PropertyKey, unknown>;
  const enumerableSymbols = Object.getOwnPropertySymbols(o).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(o, symbol),
  );

  const entries: Array<{
    sortKey: string;
    normalizedKey: string;
    property: PropertyKey;
  }> = [];

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
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });

  const body = entries.map(({ normalizedKey, property }) =>
    JSON.stringify(normalizedKey) + ":" + _stringify(target[property], stack),
  );
  stack.delete(o);
  return "{" + body.join(",") + "}";
}

function compareSerializedEntry(
  left: { serializedKey: string; serializedValue: string; order: number },
  right: { serializedKey: string; serializedValue: string; order: number },
): number {
  if (left.serializedKey < right.serializedKey) return -1;
  if (left.serializedKey > right.serializedKey) return 1;
  if (left.serializedValue < right.serializedValue) return -1;
  if (left.serializedValue > right.serializedValue) return 1;
  if (left.order < right.order) return -1;
  if (left.order > right.order) return 1;
  return 0;
}

function mapEntryPropertyKey(
  bucketKey: string,
  entryPropertyKey: string,
  entryIndex: number,
  totalEntries: number,
  entryOrder: number,
  shouldDedupeByType: boolean,
  hasDuplicatePropertyKey: boolean,
): string {
  const isLocalSymbolProperty = entryPropertyKey.startsWith(
    `${SYMBOL_SENTINEL_PREFIX}["local"`,
  );

  if (!shouldDedupeByType && isLocalSymbolProperty) {
    const uniqueIndex = hasDuplicatePropertyKey ? entryOrder : entryIndex;
    const payload = JSON.stringify([bucketKey, entryPropertyKey, uniqueIndex]);
    return typeSentinel("map-entry-index", payload);
  }

  if (
    totalEntries <= 1 ||
    (!hasDuplicatePropertyKey && entryIndex === 0)
  ) {
    return entryPropertyKey;
  }

  const uniqueIndex = hasDuplicatePropertyKey ? entryOrder : entryIndex;
  const payload = JSON.stringify([bucketKey, entryPropertyKey, uniqueIndex]);
  return typeSentinel("map-entry-index", payload);
}

function mapBucketTypeTag(rawKey: unknown): string {
  if (
    rawKey instanceof Number ||
    rawKey instanceof Boolean ||
    isBigIntObject(rawKey)
  ) {
    return mapBucketTypeTag(
      (rawKey as ValueOfCapable).valueOf(),
    );
  }
  if (typeof rawKey === "symbol") return "symbol";
  if (rawKey === null) return "null";
  if (rawKey instanceof Date) return "date";
  if (rawKey instanceof Map) return "map";
  if (rawKey instanceof Set) return "set";
  if (rawKey instanceof RegExp) return REGEXP_SENTINEL_TYPE;
  if (Array.isArray(rawKey)) return "array";
  if (sharedArrayBufferCtor && rawKey instanceof sharedArrayBufferCtor) return "sharedarraybuffer";
  if (rawKey instanceof ArrayBuffer || ArrayBuffer.isView(rawKey)) return "arraybuffer";
  return typeof rawKey;
}

const NULL_PROPERTY_KEY_SENTINEL_BUCKET_TAG = mapBucketTypeTag(null);

function buildNullPropertyKeySentinel(serializedKey: string): string {
  return typeSentinel(
    PROPERTY_KEY_SENTINEL_TYPE,
    JSON.stringify([NULL_PROPERTY_KEY_SENTINEL_BUCKET_TAG, serializedKey]),
  );
}

function buildPropertyKeySentinel(
  rawKey: unknown,
  serializedKey: string,
  stringified?: string,
): string {
  const bucketTag = mapBucketTypeTag(rawKey);
  const payloadParts = [bucketTag, serializedKey];
  if (stringified !== undefined) {
    payloadParts.push(stringified);
  }
  return typeSentinel(PROPERTY_KEY_SENTINEL_TYPE, JSON.stringify(payloadParts));
}

function toMapPropertyKey(
  rawKey: unknown,
  serializedKey: string,
): { bucketKey: string; propertyKey: string } {
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
      bucketKey: `${bucketTag}|${getSymbolBucketKey(rawKey as symbol)}`,
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

function stringifyStringLiteral(value: string): string {
  return JSON.stringify(normalizeStringLiteral(value));
}

function normalizeStringLiteral(value: string): string {
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

function needsNestedStringLiteralSentinelEscape(value: string): boolean {
  if (needsStringLiteralSentinelEscape(value)) {
    return true;
  }
  return value.startsWith(STRING_LITERAL_SENTINEL_PREFIX);
}

function hasArrayBufferLikeSentinelPrefix(value: string): boolean {
  for (const prefix of ARRAY_BUFFER_LIKE_SENTINEL_PREFIXES) {
    if (value.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function needsStringLiteralSentinelEscape(value: string): boolean {
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

  if (
    value.startsWith(SENTINEL_PREFIX) &&
    value.endsWith(SENTINEL_SUFFIX)
  ) {
    const inner = value.slice(
      SENTINEL_PREFIX.length,
      -SENTINEL_SUFFIX.length,
    );
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

function stripStringLiteralSentinelPrefix(value: string): string {
  if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
    return value.slice(STRING_LITERAL_SENTINEL_PREFIX.length);
  }
  return value;
}

function stringifySentinelLiteral(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("Sentinel literal must be a string");
  }
  return JSON.stringify(value);
}

function reviveFromSerialized(serialized: string): unknown {
  let revived: unknown;
  try {
    revived = reviveSentinelValue(JSON.parse(serialized));
  } catch {
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

function reviveSentinelValue(value: unknown): unknown {
  if (
    typeof value === "string" &&
    value.startsWith(DATE_SENTINEL_PREFIX)
  ) {
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

  if (
    typeof value === "string" &&
    value.startsWith(SENTINEL_PREFIX) &&
    value.endsWith(SENTINEL_SUFFIX)
  ) {
    const inner = value.slice(SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
    const separatorIndex = inner.indexOf(":");
    if (separatorIndex !== -1) {
      const type = inner.slice(0, separatorIndex);
      const payload = inner.slice(separatorIndex + 1);
      if (type === "string") {
        return payload;
      }
      if (type === "number") {
        if (payload === "Infinity") return Number.POSITIVE_INFINITY;
        if (payload === "-Infinity") return Number.NEGATIVE_INFINITY;
        if (payload === "NaN") return Number.NaN;
        return Number(payload);
      }
      if (type === "bigint") {
        try {
          return BigInt(payload);
        } catch {
          return value;
        }
      }
      if (type === REGEXP_SENTINEL_TYPE) {
        try {
          const parsed = JSON.parse(payload) as unknown;
          if (Array.isArray(parsed) && typeof parsed[0] === "string") {
            const flags = typeof parsed[1] === "string" ? parsed[1] : "";
            return new RegExp(parsed[0], flags);
          }
        } catch {
          return value;
        }
        return value;
      }
    }
  }
  return value;
}

function toSymbolSentinel(symbol: symbol): string {
  const globalKey =
    typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
  if (globalKey !== undefined) {
    const payload = JSON.stringify(["global", globalKey]);
    return `${SYMBOL_SENTINEL_PREFIX}${payload}`;
  }
  const record = getLocalSymbolSentinelRecord(symbol);
  return record.sentinel;
}

function getSymbolSortKey(symbol: symbol): string {
  const globalKey =
    typeof Symbol.keyFor === "function" ? Symbol.keyFor(symbol) : undefined;
  if (globalKey !== undefined) {
    return `global:${globalKey}`;
  }
  const record =
    peekLocalSymbolSentinelRecord(symbol) ??
    getLocalSymbolSentinelRecord(symbol);
  return `local:${record.identifier}`;
}

export {
  getLocalSymbolSentinelRecord as __getLocalSymbolSentinelRecordForTest,
  peekLocalSymbolSentinelRecord as __peekLocalSymbolSentinelRecordForTest,
};

function buildSetSortKey(value: unknown, serializedValue: string): string {
  if (typeof value === "symbol") {
    return getSymbolSortKey(value as symbol);
  }
  return serializedValue;
}

function toPropertyKeyString(
  rawKey: unknown,
  revivedKey: unknown,
  serializedKey: string,
): string {
  if (
    rawKey instanceof Number ||
    rawKey instanceof Boolean ||
    isBigIntObject(rawKey)
  ) {
    return toPropertyKeyString(
      (rawKey as ValueOfCapable).valueOf(),
      revivedKey,
      serializedKey,
    );
  }
  if (typeof rawKey === "symbol") {
    return toSymbolSentinel(rawKey as symbol);
  }

  if (rawKey === null) {
    return buildNullPropertyKeySentinel(serializedKey);
  }

  if (rawKey instanceof Date) {
    if (
      typeof revivedKey === "string" &&
      revivedKey.startsWith(DATE_SENTINEL_PREFIX)
    ) {
      return escapeSentinelString(revivedKey);
    }
    const { key } = getDateSentinelParts(rawKey);
    return key;
  }

  if (rawKey instanceof RegExp) {
    const normalizedFromRaw = stripStringLiteralSentinelPrefix(
      normalizePlainObjectKey(
        escapeSentinelString(buildRegExpSentinel(rawKey)),
      ),
    );
    if (revivedKey instanceof RegExp) {
      return stripStringLiteralSentinelPrefix(
        normalizePlainObjectKey(
          escapeSentinelString(buildRegExpSentinel(revivedKey)),
        ),
      );
    }
    if (typeof revivedKey === "string") {
      const normalizedRevived = normalizePlainObjectKey(
        escapeSentinelString(revivedKey),
      );
      if (normalizedRevived !== normalizedFromRaw) {
        return normalizedRevived;
      }
    }
    return normalizedFromRaw;
  }

  const rawType = typeof rawKey;
  if (rawType === "string") {
    return normalizePlainObjectKey(rawKey as string);
  }

  if (
    rawType === "number" ||
    rawType === "bigint" ||
    rawType === "boolean" ||
    rawType === "undefined"
  ) {
    return buildPropertyKeySentinel(rawKey, serializedKey);
  }

  if (rawType === "object" || rawType === "function") {
    let stringified: string | undefined;
    try {
      stringified = String(rawKey);
    } catch {
      stringified = undefined;
    }

    const propertyKeySentinel = buildPropertyKeySentinel(
      rawKey,
      serializedKey,
      stringified,
    );

    if (typeof revivedKey === "string") {
      if (needsStringLiteralSentinelEscape(revivedKey)) {
        return propertyKeySentinel;
      }
      const normalizedRevived = normalizePlainObjectKey(
        escapeSentinelString(revivedKey),
      );
      if (normalizedRevived !== propertyKeySentinel) {
        return normalizedRevived;
      }
    }

    return propertyKeySentinel;
  }

  if (typeof revivedKey === "string") {
    return normalizePlainObjectKey(escapeSentinelString(revivedKey));
  }

  return normalizePlainObjectKey(
    escapeSentinelString(String(revivedKey ?? serializedKey)),
  );
}

function reviveNumericSentinel(value: unknown): number | bigint | undefined {
  if (typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (
    typeof value === "string" &&
    value.startsWith(SENTINEL_PREFIX) &&
    value.endsWith(SENTINEL_SUFFIX)
  ) {
    const revived = reviveSentinelValue(value);
    if (typeof revived === "number" || typeof revived === "bigint") {
      return revived;
    }
  }
  return undefined;
}

function normalizePlainObjectKey(key: string): string {
  return normalizeStringLiteral(key);
}
