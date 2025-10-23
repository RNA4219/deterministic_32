import { fnv1a32, toHex32 } from "./hash.js";
import { stableStringify } from "./serialize.js";
const DEFAULT_LABELS = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ..."012345"
].slice(0, 32);
export class Cat32 {
    labels;
    salt;
    saltNamespaceEncoding;
    normalize;
    overrides;
    constructor(opts = {}) {
        const providedLabels = opts.labels;
        if (providedLabels !== undefined) {
            if (!Array.isArray(providedLabels)) {
                throw new TypeError("labels must be an array of 32 strings");
            }
            if (providedLabels.length !== 32) {
                throw new RangeError("labels length must be 32");
            }
            for (const label of providedLabels) {
                if (typeof label !== "string") {
                    throw new TypeError("labels must be an array of 32 strings");
                }
            }
            this.labels = providedLabels.slice(0, 32);
        }
        else {
            this.labels = DEFAULT_LABELS.slice(0, 32);
        }
        this.salt = opts.salt ?? "";
        const namespaceValue = opts.namespace;
        if (!this.salt && namespaceValue === undefined) {
            this.saltNamespaceEncoding = undefined;
        }
        else if (namespaceValue === undefined) {
            this.saltNamespaceEncoding = `|salt:${this.salt}`;
        }
        else {
            const encoded = JSON.stringify([this.salt, namespaceValue]);
            this.saltNamespaceEncoding = `|saltns:${encoded}`;
        }
        const normalize = opts.normalize ?? "nfkc";
        if (normalize !== "none" &&
            normalize !== "nfc" &&
            normalize !== "nfd" &&
            normalize !== "nfkc" &&
            normalize !== "nfkd") {
            throw new RangeError("normalize must be one of \"none\", \"nfc\", \"nfd\", \"nfkc\", or \"nfkd\"");
        }
        this.normalize = normalize;
        this.overrides = new Map();
        if (opts.overrides) {
            for (const [rawKey, v] of Object.entries(opts.overrides)) {
                const k = this.normalizeCanonicalKey(rawKey);
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
        if (this.saltNamespaceEncoding === undefined) {
            return s;
        }
        return `${s}${this.saltNamespaceEncoding}`;
    }
    canonicalKey(input) {
        const serialized = stableStringify(input);
        return this.normalizeCanonicalKey(serialized);
    }
    normalizeCanonicalKey(key) {
        switch (this.normalize) {
            case "nfc":
                return key.normalize("NFC");
            case "nfd":
                return key.normalize("NFD");
            case "nfkc":
                return key.normalize("NFKC");
            case "nfkd":
                return key.normalize("NFKD");
            default:
                return key;
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
