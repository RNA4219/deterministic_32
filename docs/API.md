# API: TypeScript

```ts
export type NormalizeMode = "none" | "nfc" | "nfd" | "nfkc" | "nfkd";

export interface CategorizerOptions {
  salt?: string;
  namespace?: string;
  labels?: string[];            // length === 32
  normalize?: NormalizeMode;    // default "nfkc"; accepts "none" | "nfc" | "nfd" | "nfkc" | "nfkd"
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

export function stableStringify(value: unknown): string;
export type StableStringify = typeof stableStringify;
```

`normalize` には Unicode 正規化モードとして `"none" | "nfc" | "nfd" | "nfkc" | "nfkd"` の 5 種類を指定できます（CLI の `--normalize` も同じ値を受け付けます）。既定値は `"nfkc"` です。

### 例
```ts
import { Cat32 } from "deterministic-32";

const cat = new Cat32({ salt: "projX", namespace: "v1" });
const a = cat.assign({ id: 1, tags: ["a", "b"] });
// a = { index, label, hash, key }
```

### stableStringify で canonical key を取得する

`stableStringify(value)` は `Cat32.assign(value).key` と同じ canonical key を生成し、構造化データを事前に文字列化する用途に利用できます。`normalize` オプションはコンストラクター側で再適用されるため、`stableStringify` 単体で事前計算しても整合性が保たれます。型注釈が必要な場合は `StableStringify` を利用すると、API のシグネチャと揃えられます。

### overrides の canonical key 取得

`overrides` のキーには上記 `stableStringify(value)` で得た canonical key を渡してください。`Cat32.assign(value).key` でも同じ結果を得られます。
