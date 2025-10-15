export type NormalizeMode = "none" | "nfc" | "nfkc";
export interface CategorizerOptions {
    salt?: string;
    namespace?: string;
    labels?: string[];
    normalize?: NormalizeMode;
    overrides?: Record<string, number | string>;
}
export interface Assignment {
    index: number;
    label: string;
    hash: string;
    key: string;
}
export declare class Cat32 {
    private labels;
    private salt;
    private normalize;
    private overrides;
    constructor(opts?: CategorizerOptions);
    assign(input: unknown): Assignment;
    index(input: unknown): number;
    labelOf(input: unknown): string;
    private salted;
    private canonicalKey;
    private normalizeIndex;
}
