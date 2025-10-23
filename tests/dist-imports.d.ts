declare module "../dist/categorizer.js" {
  export type {
    NormalizeMode,
    CategorizerOptions,
    Assignment,
  } from "../src/categorizer.js";
  export { Cat32 } from "../src/categorizer.js";
}

declare module "../dist/index.js" {
  export type { NormalizeMode } from "../src/categorizer.js";
}

type DistNormalizeMode = import("../dist/index.js").NormalizeMode;
type SrcNormalizeMode = import("../src/index.js").NormalizeMode;

type _AssertDistNormalizeMode = DistNormalizeMode extends import("../src/categorizer.js").NormalizeMode
  ? true
  : never;
type _AssertSrcNormalizeMode = SrcNormalizeMode extends import("../src/categorizer.js").NormalizeMode
  ? true
  : never;

declare module "../dist/hash.js" {
  export { fnv1a32, toHex32 } from "../src/hash.js";
}
