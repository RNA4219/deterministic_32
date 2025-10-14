// FNV-1a 32-bit over UTF-8 bytes (deterministic, fast, no deps)
export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  const bytes = new TextEncoder().encode(input);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193); // 16777619
  }
  return h >>> 0;
}

export function toHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}
