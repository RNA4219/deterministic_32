// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps/Sets are serialized as arrays in insertion order (keys sorted for Map via key string).

const SENTINEL_PREFIX = "\u0000cat32:";
const STRING_SENTINEL_PREFIX = `${SENTINEL_PREFIX}string:`;
const SENTINEL_SUFFIX = "\u0000";
const HOLE_SENTINEL = JSON.stringify(typeSentinel("hole"));
const UNDEFINED_SENTINEL = "__undefined__";
const DATE_SENTINEL_PREFIX = "__date__:";
const BIGINT_SENTINEL_PREFIX = "__bigint__:";
const NUMBER_SENTINEL_PREFIX = "__number__:";
const STRING_LITERAL_SENTINEL_PREFIX = "__string__:";

export function typeSentinel(type: string, payload = ""): string {
  return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}

export function escapeSentinelString(value: string): string {
  if (isSentinelWrappedString(value) && !value.startsWith(STRING_SENTINEL_PREFIX)) {
    return typeSentinel("string", value);
  }
  if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
    return typeSentinel("string", value);
  }
  return value;
}

export function stableStringify(v: unknown): string {
  const stack = new Set<any>();
  return _stringify(v, stack);
}

function isSentinelWrappedString(value: string): boolean {
  return value.startsWith(SENTINEL_PREFIX) && value.endsWith(SENTINEL_SUFFIX);
}

function _stringify(v: unknown, stack: Set<any>): string {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "string") return stringifyStringLiteral(v as string);
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
  if (t === "function" || t === "symbol") {
    return String(v);
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
    return stringifySentinelLiteral(`${DATE_SENTINEL_PREFIX}${v.toISOString()}`);
  }

  // Map
  if (v instanceof Map) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const normalizedEntries: Record<string, string> = Object.create(null);
    for (const [rawKey, rawValue] of v.entries()) {
      const serializedKey = _stringify(rawKey, stack);
      const revivedKey = reviveFromSerialized(serializedKey);
      const propertyKey = toPropertyKeyString(revivedKey, serializedKey);
      const serializedValue = _stringify(rawValue, stack);
      normalizedEntries[propertyKey] = serializedValue;
    }
    const sortedKeys = Object.keys(normalizedEntries).sort();
    let body = "";
    for (let i = 0; i < sortedKeys.length; i += 1) {
      const key = sortedKeys[i];
      const serializedValue = normalizedEntries[key];
      if (i > 0) body += ",";
      body += JSON.stringify(key);
      body += ":";
      body += serializedValue;
    }
    stack.delete(v);
    return "{" + body + "}";
  }

  // Set
  if (v instanceof Set) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const serializedValues = Array.from(v.values(), (value) =>
      _stringify(value, stack),
    );
    serializedValues.sort();
    const out = "[" + serializedValues.join(",") + "]";
    stack.delete(v);
    return out;
  }

  // Plain object
  const o = v as Record<string, unknown>;
  if (stack.has(o)) throw new TypeError("Cyclic object");
  stack.add(o);
  const keys = Object.keys(o).sort();
  const body = keys.map((k) => {
    const normalizedKey = normalizePlainObjectKey(k);
    return JSON.stringify(normalizedKey) + ":" + _stringify(o[k], stack);
  });
  stack.delete(o);
  return "{" + body.join(",") + "}";
}

function stringifyStringLiteral(value: string): string {
  if (value.startsWith(STRING_LITERAL_SENTINEL_PREFIX)) {
    return JSON.stringify(typeSentinel("string", value));
  }
  if (isSentinelWrappedString(value)) {
    if (value.startsWith(STRING_SENTINEL_PREFIX)) {
      return JSON.stringify(value);
    }
    return JSON.stringify(typeSentinel("string", value));
  }
  return JSON.stringify(value);
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
    }
  }
  return value;
}

function toPropertyKeyString(value: unknown, fallback: string): string {
  if (value === null) return "null";
  const numeric = reviveNumericSentinel(value);
  if (numeric !== undefined) {
    return String(numeric);
  }
  const type = typeof value;
  if (type === "object" || type === "function") {
    const fallbackNumeric = reviveNumericSentinel(fallback);
    if (fallbackNumeric !== undefined) {
      return String(fallbackNumeric);
    }
    return fallback;
  }
  if (type === "symbol") {
    return (value as symbol).toString();
  }
  if (
    type === "string" &&
    (value as string).startsWith(STRING_SENTINEL_PREFIX) &&
    (value as string).endsWith(SENTINEL_SUFFIX)
  ) {
    return (value as string).slice(STRING_SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length);
  }
  return String(value);
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
  const numeric = reviveNumericSentinel(key);
  if (numeric !== undefined) {
    return String(numeric);
  }
  return key;
}
