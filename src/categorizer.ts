import { fnv1a32, toHex32 } from "./hash.js";
import { stableStringify, typeSentinel } from "./serialize.js";

export type NormalizeMode = "none" | "nfc" | "nfkc";

export interface CategorizerOptions {
  salt?: string;                 // domain separation
  namespace?: string;            // sub-domain separation
  labels?: string[];             // must be length 32 if provided
  normalize?: NormalizeMode;     // default: "nfkc"
  overrides?: Record<string, number | string>; // canonicalKey -> index or label
}

export interface Assignment {
  index: number;   // 0..31
  label: string;   // labels[index]
  hash: string;    // 8-hex fnv1a32
  key: string;     // canonicalized key used for hashing
}

const DEFAULT_LABELS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."012345"
].slice(0, 32);

export class Cat32 {
  private labels: string[];
  private salt: string;
  private normalize: NormalizeMode;
  private overrides: Map<string, number>;

  constructor(opts: CategorizerOptions = {}) {
    this.labels = (opts.labels && opts.labels.length === 32) ? opts.labels.slice(0, 32) : DEFAULT_LABELS;
    if (opts.labels && opts.labels.length !== 32) {
      throw new RangeError("labels length must be 32");
    }
    const baseSalt = opts.salt ?? "";
    const ns = opts.namespace ? `|ns:${opts.namespace}` : "";
    this.salt = `${baseSalt}${ns}`;
    this.normalize = opts.normalize ?? "nfkc";
    this.overrides = new Map();

    if (opts.overrides) {
      for (const [rawKey, v] of Object.entries(opts.overrides)) {
        const k = this.canonicalKey(rawKey);
        if (typeof v === "number") {
          this.overrides.set(k, this.normalizeIndex(v));
        } else {
          const idx = this.labels.indexOf(v);
          if (idx === -1) throw new Error(`override label "${v}" not in labels`);
          this.overrides.set(k, idx);
        }
      }
    }
  }

  assign(input: unknown): Assignment {
    const key = this.canonicalKey(input);
    const pinned = this.overrides.get(key);
    if (pinned !== undefined) {
      const label = this.labels[pinned];
      const h = fnv1a32(this.salted(key));
      return { index: pinned, label, hash: toHex32(h), key };
    }
    const h = fnv1a32(this.salted(key));
    const index = h & 31; // 0..31
    const label = this.labels[index];
    return { index, label, hash: toHex32(h), key };
  }

  index(input: unknown): number {
    return this.assign(input).index;
  }
  labelOf(input: unknown): string {
    return this.assign(input).label;
  }

  private salted(s: string): string {
    return this.salt ? `${s}|salt:${this.salt}` : s;
  }

  private canonicalKey(input: unknown): string {
    let s: string;
    switch (typeof input) {
      case "string":
        s = input;
        break;
      case "bigint":
        s = typeSentinel("bigint", input.toString());
        break;
      case "number":
      case "boolean":
        s = String(input);
        break;
      case "object":
        s = stableStringify(input);
        break;
      case "undefined":
        s = typeSentinel("undefined");
        break;
      default:
        s = String(input);
    }
    if (this.normalize === "nfc") return s.normalize("NFC");
    if (this.normalize === "nfkc") return s.normalize("NFKC");
    return s;
  }

  private normalizeIndex(i: number): number {
    const n = Math.trunc(i);
    if (n < 0 || n > 31) throw new Error(`index out of range: ${i}`);
    return n;
  }
}
