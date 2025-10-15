# API: TypeScript

```ts
export type NormalizeMode = "none" | "nfc" | "nfkc";

export interface CategorizerOptions {
  salt?: string;
  namespace?: string;
  labels?: string[];            // length === 32
  normalize?: NormalizeMode;    // default "nfkc"
  overrides?: Record<string, number | string>;  // use Cat32.assign(...).key or stableStringify(...) for keys
}

export interface Assignment {
  index: number;   // 0..31
  label: string;   // labels[index]
  hash: string;    // 8-hex lowercase
  key: string;     // canonical key after stringify + normalize
}

export class Cat32 {
  constructor(opts?: CategorizerOptions);

  assign(input: unknown): Assignment;

  /** Convenience wrappers */
  index(input: unknown): number;
  labelOf(input: unknown): string;
}
```

### 例
```ts
import { Cat32 } from "deterministic-32";

const cat = new Cat32({ salt: "projX", namespace: "v1" });
const a = cat.assign({ id: 1, tags: ["a", "b"] });
// a = { index, label, hash, key }
```

### overrides の canonical key 取得

`overrides` のキーには `stableStringify(value)` で得た canonical key を渡してください。`Cat32.assign(value).key` でも同じ結果を得られますが、`overrides` 用に事前計算する場合は `stableStringify` のみで十分です（constructor 側で `normalize` が再適用されます）。
