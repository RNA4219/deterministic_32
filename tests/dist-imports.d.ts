declare module "../dist/categorizer.js" {
  export type {
    NormalizeMode,
    CategorizerOptions,
    Assignment,
  } from "../src/categorizer.js";
  export { Cat32 } from "../src/categorizer.js";
}

declare module "../dist/hash.js" {
  export { fnv1a32, toHex32 } from "../src/hash.js";
}
