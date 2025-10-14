// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps/Sets are serialized as arrays in insertion order (keys sorted for Map via key string).

const SENTINEL_PREFIX = "\u0000cat32:";
const SENTINEL_SUFFIX = "\u0000";
const STRING_SENTINEL_PREFIX = `${SENTINEL_PREFIX}string:`;

export function typeSentinel(type: string, payload = ""): string {
  return `${SENTINEL_PREFIX}${type}:${payload}${SENTINEL_SUFFIX}`;
}

export function escapeSentinelString(value: string): string {
  if (!value.startsWith(SENTINEL_PREFIX)) {
    return value;
  }
  if (value.startsWith(STRING_SENTINEL_PREFIX) && value.endsWith(SENTINEL_SUFFIX)) {
    return value;
  }
  return typeSentinel("string", value);
}

export function stableStringify(v: unknown): string {
  const stack = new Set<any>();
  return _stringify(v, stack);
}

function _stringify(v: unknown, stack: Set<any>): string {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "string") return JSON.stringify(escapeSentinelString(v as string));
  if (t === "number") {
    const value = v as number;
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return JSON.stringify(typeSentinel("number", String(value)));
    }
    return JSON.stringify(value);
  }
  if (t === "boolean") return JSON.stringify(v);
  if (t === "bigint") return JSON.stringify(typeSentinel("bigint", (v as bigint).toString()));
  if (t === "undefined") return JSON.stringify(typeSentinel("undefined"));
  if (t === "function" || t === "symbol") return JSON.stringify(String(v));

  if (Array.isArray(v)) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const out = "[" + v.map((x) => _stringify(x, stack)).join(",") + "]";
    stack.delete(v);
    return out;
  }

  // Date
  if (v instanceof Date) {
    return JSON.stringify(typeSentinel("date", v.toISOString()));
  }

  // Map
  if (v instanceof Map) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const entries = Array.from(v.entries()).map(([k, val], idx) => ({
      key: _stringify(k, stack),
      value: _stringify(val, stack),
      order: idx,
    }));
    entries.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return a.order - b.order;
    });
    const body = entries
      .map(({ key, value }) => "[" + key + "," + value + "]")
      .join(",");
    stack.delete(v);
    return "[\"__map__\"" + (body.length ? "," + body : "") + "]";
  }

  // Set
  if (v instanceof Set) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const arr = Array.from(v.values()).map((x) => _stringify(x, stack));
    const out =
      "[\"__set__\"" + (arr.length > 0 ? "," + arr.join(",") : "") + "]";
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
