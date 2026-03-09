type ValueOfCapable = {
    valueOf(): unknown;
};
type SymbolObject = ValueOfCapable & {
    valueOf(): symbol;
    readonly __cat32SymbolObjectBrand?: never;
};
type LocalSymbolSentinelRecord = {
    identifier: string;
    sentinel: string;
};
declare function peekLocalSymbolSentinelRecord(symbol: symbol): LocalSymbolSentinelRecord | undefined;
declare function getLocalSymbolSentinelRecord(symbol: symbol): LocalSymbolSentinelRecord;
export declare function typeSentinel(type: string, payload?: string): string;
export declare function escapeSentinelString(value: string): string;
export declare function stableStringify(v: unknown): string;
declare function reviveSentinelValue(value: unknown): unknown;
export { getLocalSymbolSentinelRecord as __getLocalSymbolSentinelRecordForTest, peekLocalSymbolSentinelRecord as __peekLocalSymbolSentinelRecordForTest, getLocalSymbolRegistrySizeForTest as __getLocalSymbolRegistrySizeForTest, reviveSentinelValue as __reviveSentinelValueForTest, };
export type { SymbolObject as __SymbolObjectForTest };
declare function getLocalSymbolRegistrySizeForTest(): number;
