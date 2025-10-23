export const assertSymbolObjectIsNotNever = false;
const localSymbolObjectRegistry = new Map();
const localSymbolSentinelRegistry = new WeakMap();
export const getOrCreateSymbolObject = (symbol) => {
    const existing = localSymbolObjectRegistry.get(symbol);
    if (existing !== undefined) {
        return existing;
    }
    const created = Object(symbol);
    localSymbolObjectRegistry.set(symbol, created);
    localSymbolSentinelRegistry.set(created, {
        sentinel: symbol.description ?? "",
    });
    return created;
};
const exampleSymbol = Symbol("symbol-wrapper-typing");
const exampleObject = getOrCreateSymbolObject(exampleSymbol);
const maybeRecord = localSymbolSentinelRegistry.get(exampleObject);
const sentinelLength = maybeRecord?.sentinel.length;
if (typeof sentinelLength === "number") {
    sentinelLength.toFixed();
}
