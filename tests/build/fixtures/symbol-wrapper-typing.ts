import type { __SymbolObjectForTest } from "../../../src/serialize.js";

type SymbolObject = __SymbolObjectForTest;

type AssertFalse<T extends false> = T;
type SymbolObjectIsNever = [SymbolObject] extends [never] ? true : false;
export type AssertSymbolObjectIsNotNever = AssertFalse<SymbolObjectIsNever>;

const localSymbolObjectRegistry = new Map<symbol, SymbolObject>();
const localSymbolSentinelRegistry = new WeakMap<SymbolObject, { sentinel: string }>();

export const getOrCreateSymbolObject = (symbol: symbol): SymbolObject => {
  const existing = localSymbolObjectRegistry.get(symbol);
  if (existing !== undefined) {
    return existing;
  }

  const created = Object(symbol) as SymbolObject;
  localSymbolObjectRegistry.set(symbol, created);
  localSymbolSentinelRegistry.set(created, {
    sentinel: symbol.description ?? "",
  });
  return created;
};

const exampleSymbol = Symbol("symbol-wrapper-typing");
const exampleObject = getOrCreateSymbolObject(exampleSymbol);
const maybeRecord = localSymbolSentinelRegistry.get(exampleObject);

if (maybeRecord) {
  void maybeRecord.sentinel.length;
}
