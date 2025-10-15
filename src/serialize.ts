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
const STRING_SENTINEL_PREFIX = `${SENTINEL_PREFIX}string:`;

export function typeSentinel(type: string, payload = ""): string {
  return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}

const SENTINEL_STRING_PREFIXES = [
  DATE_SENTINEL_PREFIX,
  BIGINT_SENTINEL_PREFIX,
  NUMBER_SENTINEL_PREFIX,
];

export function escapeSentinelString(value: string): string {
  if (value === UNDEFINED_SENTINEL) {
    return value;
  }
  for (const prefix of SENTINEL_STRING_PREFIXES) {
    if (value.startsWith(prefix)) {
      return value;
    }
  }
  return JSON.stringify(value);
}

export function stableStringify(v: unknown): string {
  const stack = new Set<any>();
  return _stringify(v, stack);
}

function _stringify(v: unknown, stack: Set<any>): string {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "string") return JSON.stringify(v);
  if (t === "number") {
    const value = v as number;
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return JSON.stringify(typeSentinel("number", String(value)));
    }
    return JSON.stringify(value);
  }
  if (t === "boolean") return JSON.stringify(v);
  if (t === "bigint") return JSON.stringify(typeSentinel("bigint", (v as bigint).toString()));
  if (t === "undefined") return JSON.stringify(UNDEFINED_SENTINEL);
  if (t === "function" || t === "symbol") return JSON.stringify(String(v));

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
    return JSON.stringify(`${DATE_SENTINEL_PREFIX}${v.toISOString()}`);
  }

  // Map
  if (v instanceof Map) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const normalizedEntries = new Map<string, unknown>();
    for (const [rawKey, rawValue] of v.entries()) {
      const serializedKey = _stringify(rawKey, stack);
      const revivedKey = reviveFromSerialized(serializedKey);
      const propertyKey = toPropertyKeyString(
        revivedKey.value,
        serializedKey,
        revivedKey.stringSentinel,
      );
      const serializedValue = _stringify(rawValue, stack);
      const revivedValue = reviveFromSerialized(serializedValue);
      normalizedEntries.set(propertyKey, revivedValue.value);
    }
    const keys = Array.from(normalizedEntries.keys()).sort();
    const body = keys
      .map((key) => {
        const revivedValue = normalizedEntries.get(key)!;
        return JSON.stringify(key) + ":" + JSON.stringify(revivedValue);
      })
      .join(",");
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
  const body = keys.map((k) => JSON.stringify(k) + ":" + _stringify(o[k], stack));
  stack.delete(o);
  return "{" + body.join(",") + "}";
}

type RevivedSerialized = {
  value: unknown;
  stringSentinel?: string;
};

function reviveFromSerialized(serialized: string): RevivedSerialized {
  try {
    const value = JSON.parse(serialized);
    if (typeof value === "string") {
      const sentinelString = reviveStringSentinel(value);
      if (sentinelString !== undefined) {
        return { value, stringSentinel: sentinelString };
      }
    }
    return { value };
  } catch {
    return { value: serialized };
  }
}

function toPropertyKeyString(
  value: unknown,
  fallback: string,
  stringSentinel?: string,
): string {
  if (stringSentinel !== undefined) {
    return stringSentinel;
  }
  if (value === null) return "null";
  const type = typeof value;
  if (type === "object" || type === "function") {
    return fallback;
  }
  if (type === "symbol") {
    return (value as symbol).toString();
  }
  return String(value);
}

function reviveStringSentinel(value: string): string | undefined {
  if (!value.startsWith(STRING_SENTINEL_PREFIX) || !value.endsWith(SENTINEL_SUFFIX)) {
    return undefined;
  }
  return value.slice(
    STRING_SENTINEL_PREFIX.length,
    value.length - SENTINEL_SUFFIX.length,
  );
}
