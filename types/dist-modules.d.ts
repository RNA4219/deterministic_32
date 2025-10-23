declare module "../dist/categorizer.js" {
  export type { NormalizeMode, CategorizerOptions, Assignment } from "../src/categorizer";
  export { Cat32 } from "../src/categorizer";
}

declare module "../dist/hash.js" {
  export { fnv1a32, toHex32 } from "../src/hash";
}
