// Stable stringify with cycle detection and key-sorted objects.
// Notes:
// - Distinguishes [], {}, "" etc.
// - Treats Date as ISO string.
// - Maps/Sets are serialized as arrays in insertion order (keys sorted for Map via key string).

export function stableStringify(v: unknown): string {
  const stack = new Set<any>();
  return _stringify(v, stack);
}

function _stringify(v: unknown, stack: Set<any>): string {
  if (v === null) return "null";
  const t = typeof v;

  if (t === "string") return JSON.stringify(v);
  if (t === "number") {
    const num = v as number;
    if (Number.isNaN(num)) return '"__nan__"';
    if (!Number.isFinite(num)) {
      const sign = num > 0 ? "+" : "-";
      return JSON.stringify(`__inf__:${sign}`);
    }
    return JSON.stringify(num);
  }
  if (t === "boolean") return JSON.stringify(v);
  if (t === "bigint") return `"__bigint__:${(v as bigint).toString()}"`;
  if (t === "undefined") return '"__undefined__"';
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
    return JSON.stringify(`__date__:${v.toISOString()}`);
  }

  // Map
  if (v instanceof Map) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const entries = Array.from(v.entries()).map(([k, val], idx) => ({
      key: _stringify(k, stack),
      value: val,
      order: idx,
    }));
    entries.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return a.order - b.order;
    });
    const body = entries.map(({ key, value }) => JSON.stringify(key) + ":" + _stringify(value, stack));
    stack.delete(v);
    return "{" + body.join(",") + "}";
  }

  // Set
  if (v instanceof Set) {
    if (stack.has(v)) throw new TypeError("Cyclic object");
    stack.add(v);
    const arr = Array.from(v.values()).map((x) => _stringify(x, stack));
    const out = "[" + arr.join(",") + "]";
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
