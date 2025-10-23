import type { __SymbolObjectForTest } from "../../../src/serialize.js";
type SymbolObject = __SymbolObjectForTest;
type AssertFalse<T extends false> = T;
type SymbolObjectIsNever = [SymbolObject] extends [never] ? true : false;
type SymbolObjectIsNotNever = AssertFalse<SymbolObjectIsNever>;
export declare const assertSymbolObjectIsNotNever: SymbolObjectIsNotNever;
export declare const getOrCreateSymbolObject: (symbol: symbol) => SymbolObject;
export {};
