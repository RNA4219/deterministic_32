import { fnv1a32, toHex32 } from "./hash.js";
import { stableStringify } from "./serialize.js";
const DEFAULT_LABELS = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ..."012345"
].slice(0, 32);
export class Cat32 {
    labels;
    salt;
    normalize;
    overrides;
    constructor(opts = {}) {
        this.labels = (opts.labels && opts.labels.length === 32) ? opts.labels.slice(0, 32) : DEFAULT_LABELS;
        if (opts.labels && opts.labels.length !== 32) {
            throw new RangeError("labels length must be 32");
        }
        const baseSalt = opts.salt ?? "";
        const ns = opts.namespace ? `|ns:${opts.namespace}` : "";
        this.salt = `${baseSalt}${ns}`;
        const normalize = opts.normalize ?? "nfkc";
        if (normalize !== "none" && normalize !== "nfc" && normalize !== "nfkc") {
            throw new RangeError("normalize must be one of \"none\", \"nfc\", or \"nfkc\"");
        }
        this.normalize = normalize;
        this.overrides = new Map();
        if (opts.overrides) {
            for (const [rawKey, v] of Object.entries(opts.overrides)) {
                const k = this.canonicalKey(rawKey);
                if (typeof v === "number") {
                    this.overrides.set(k, this.normalizeIndex(v));
                }
                else {
                    const idx = this.labels.indexOf(v);
                    if (idx === -1)
                        throw new Error(`override label "${v}" not in labels`);
                    this.overrides.set(k, idx);
                }
            }
        }
    }
    assign(input) {
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
    index(input) {
        return this.assign(input).index;
    }
    labelOf(input) {
        return this.assign(input).label;
    }
    salted(s) {
        return this.salt ? `${s}|salt:${this.salt}` : s;
    }
    canonicalKey(input) {
        const serialized = stableStringify(input);
        switch (this.normalize) {
            case "nfc":
                return serialized.normalize("NFC");
            case "nfkc":
                return serialized.normalize("NFKC");
            default:
                return serialized;
        }
    }
    normalizeIndex(i) {
        if (!Number.isFinite(i) || !Number.isInteger(i)) {
            throw new Error(`index out of range: ${i}`);
        }
        if (i < 0 || i > 31) {
            throw new Error(`index out of range: ${i}`);
        }
        return i;
    }
}
