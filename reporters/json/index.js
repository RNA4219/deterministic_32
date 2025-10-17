const sanitize = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) {
    return value;
  }
  const valueType = typeof value;
  if (valueType === 'bigint') {
    return { type: 'bigint', value: value.toString() };
  }
  if (valueType === 'symbol') {
    return value.toString();
  }
  if (value instanceof Date) {
    return { type: 'date', value: value.toISOString() };
  }
  if (value instanceof Error) {
    const plain = {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null
    };
    if ('code' in value && value.code !== undefined) {
      plain.code = value.code;
    }
    if ('cause' in value && value.cause !== undefined) {
      plain.cause = sanitize(value.cause, seen);
    }
    return plain;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }
  if (valueType === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    if (value instanceof Map) {
      const entries = [];
      for (const [key, entryValue] of value.entries()) {
        entries.push([sanitize(key, seen), sanitize(entryValue, seen)]);
      }
      seen.delete(value);
      return { type: 'map', entries };
    }
    if (value instanceof Set) {
      const items = [];
      for (const item of value.values()) {
        items.push(sanitize(item, seen));
      }
      seen.delete(value);
      return { type: 'set', values: items };
    }
    const plain = {};
    for (const [key, entryValue] of Object.entries(value)) {
      const sanitizedValue = sanitize(entryValue, seen);
      if (sanitizedValue !== undefined) {
        plain[key] = sanitizedValue;
      }
    }
    seen.delete(value);
    return plain;
  }
  if (valueType === 'function') {
    return value.name ? `[Function: ${value.name}]` : '[Function]';
  }
  return value;
};

export default async function* jsonReporter(source) {
  for await (const { type, data } of source) {
    yield `${JSON.stringify({ type, data: sanitize(data) })}\n`;
  }
}
