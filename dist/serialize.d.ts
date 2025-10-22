type LocalSymbolSentinelRecord = {
    identifier: string;
    sentinel: string;
};
declare function peekLocalSymbolSentinelRecord(symbol: symbol): LocalSymbolSentinelRecord | undefined;
declare function getLocalSymbolSentinelRecord(symbol: symbol): LocalSymbolSentinelRecord;
export declare function typeSentinel(type: string, payload?: string): string;
export declare function escapeSentinelString(value: string): string;
export declare function stableStringify(v: unknown): string;
export { getLocalSymbolSentinelRecord as __getLocalSymbolSentinelRecordForTest, peekLocalSymbolSentinelRecord as __peekLocalSymbolSentinelRecordForTest, };
