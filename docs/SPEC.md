# SPEC: deterministic-32（決定的32分割）

> 実装者向けの**厳密仕様**。この文書だけで互換実装できることを目標とする。

## 1. スコープ
- 任意入力 `unknown` を **32個のバケット (0..31)** に**決定的**に対応付ける。
- 依存ゼロ / Node・ブラウザ両対応を想定。
- セキュリティ用途ではなく、カテゴリ分け・シャーディング・負荷分散・難易度帯決定などの**安定化**が目的。

## 2. 用語
- **正規化キー (canonical key)**: `stableStringify(input)` → Unicode 正規化を施した **文字列**。
- **ハッシュ**: **FNV‑1a 32-bit** を **UTF‑8** バイト列に適用した 32bit 値。
- **インデックス**: `hash & 31` ∈ `[0,31]`。
- **ラベル**: 表示名配列（長さ **32**）。既定は `["A".."Z","0".."5"]`。

## 3. 変換パイプライン
```
input (unknown)
   └─▶ stableStringify(input)              // 順序非依存の決定的シリアライズ（§4）
        └─▶ unicodeNormalize(str, mode)    // "nfkc" | "nfc" | "none"（既定: "nfkc"）
             └─▶ salted(str, salt, ns)     // {str} + "|salt:" + salt + ("|ns:"+ns?)
                  └─▶ FNV-1a32(utf8)       // §5
                       └─▶ index = hash & 31
```

## 4. stableStringify（決定的直列化）
- 目的: **同値**で**キー順が違う**オブジェクトが**同一の文字列**になること。
- 仕様（抜粋）:
  - `null` → `"null"`、`undefined` → `"__undefined__"`
  - `boolean` → `"true"|"false"`、`number`/`bigint` → `JSON.stringify` に準拠
  - `string` → `JSON.stringify` に準拠（`"` で囲む）
  - **Array**: `[...]`（順序維持）
  - **Object**: 自身の**列挙可能プロパティ**を**キー昇順**で `{k:v}` 並べる
  - **Date**: `"__date__:<ISO8601>"`
  - **Map**: `{"k":"v"...}`（キーを**文字列化**→昇順）
  - **Set**: `[...]`（要素を正規化直列化して配列化／順序の安定化は実装依存、推奨: 直列化後の文字列昇順）
  - `function`/`symbol`: `String(v)`
  - **循環参照**を検出したら **`TypeError("Cyclic object")`** を投げる。
- 実装ノート:
  - JSON表現は**ASCIIエスケープ不要**（UTF‑8運用を前提）。
  - TypedArray/ArrayBuffer等は**`String(v)`** か実装外とし、必要なら将来の拡張（`namespace`切替）で対応。

## 5. ハッシュ（FNV‑1a 32-bit）
- 定数: `offset = 0x811C9DC5`、`prime = 0x01000193`。
- 擬似コード（JS相当）:
  ```ts
  let h = 0x811c9dc5 >>> 0;
  for (const b of utf8Bytes(saltedKey)) {{
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0; // 32bit wrap
  }}
  return h >>> 0;
  ```
- 出力の**表示**は `8桁16進（lowercase, zero-padded）` を推奨。

## 6. インデックスとラベル
- `index = hash & 31`。
- `labels.length` は **必ず 32**。違えば `RangeError`。
- `label = labels[index]`。

## 7. salt / namespace
- `saltedKey = canonical + (salt||ns ? "|salt:" + salt + (ns ? "|ns:"+ns : "") : "")`
- 目的:
  - **salt**: システム間でバケット配置の**平行移動**（衝突回避／A/B切替）
  - **namespace**: **互換性が変わる**仕様変更を**明示的に切替**

## 8. overrides（ピン留め）
- 型: `Record<string, number | string>`（キーは**正規化前**の文字列→内部で**正規化キー**に変換）
- 値: `0..31` の **index** または `labels` の **文字列**。
- `index` 範囲外、`label` が見つからない場合は `Error`。

## 9. エラー条件
- 循環参照（§4）: `TypeError("Cyclic object")`
- `labels.length !== 32`: `RangeError`
- `overrides` の index 範囲外・未知label: `Error`

## 10. 互換性ポリシー
- 本仕様の変更で結果が変わる場合は、**新しい `namespace` 値**を採用し、既存との混在運用を可能にする。
- パッケージの SemVer は**公開API**準拠。出力の決定性は `namespace` 次第。

## 11. 既知の境界
- 非暗号（衝突回避用途ではない）。必要なら xxHash/Murmur 等の採用を**別パッケージ**で検討。
- Unicode の互換分解・合成は `normalize` モードに従う（既定 NFKC）。
