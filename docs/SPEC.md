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
        └─▶ unicodeNormalize(str, mode)    // "nfkc" | "nfkd" | "nfd" | "nfc" | "none"（既定: "nfkc"）
             └─▶ salted(str, salt, ns)     // {str} + (ns?"|saltns:"+JSON.stringify([salt, ns]):salt?"|salt:"+salt:"")
                  └─▶ FNV-1a32(utf8)       // §5
                       └─▶ index = hash & 31
```

- `namespace` 未指定時は `|salt:` + `salt`
- `namespace` 指定時は `|saltns:` + `JSON.stringify([salt, namespace])`

## 4. stableStringify（決定的直列化）
- 目的: **同値**で**キー順が違う**オブジェクトが**同一の文字列**になること。
- 仕様（抜粋）:
  - `null` → `"null"`、`undefined` → `"__undefined__"`
  - `boolean` → `"true"|"false"`
  - `number` → 有限値は `JSON.stringify` に準拠。`NaN` / `Infinity` / `-Infinity` は `typeSentinel("number", String(value))` を生成し、そのままセンチネル文字列として直列化する。
  - `bigint` → 常に `typeSentinel("bigint", value.toString())` を生成し、センチネル文字列として直列化する。
  - `string` → `JSON.stringify` に準拠（`"` で囲む）。センチネル文字列（`__undefined__` や `\u0000cat32:...\u0000` など）と衝突する場合は `__string__:` プレフィックスを 1 回以上付与してエスケープする。
  - `new Number(...)` / `new Boolean(...)` / `Object(1n)` などのボックス化プリミティブは `.valueOf()` でアンボックスした値に対して上記ルール（含センチネル処理）を適用する。
  - **Array**: `[...]`（順序維持）。**疎配列**では、欠番インデックスごとに `typeSentinel("hole","__hole__")` を挿入したうえで JSON 配列に変換する。これは実際の `undefined` 要素とは区別され、後者は `"__undefined__"` として直列化される。
    - 例: `stableStringify([1,,3])` → `"[1,\"\\u0000cat32:hole:__hole__\\u0000\",3]"`
    - 例: `stableStringify([1, undefined, 3])` → `"[1,\"__undefined__\",3]"`
  - **Object**: 自身の**列挙可能プロパティ**を**キー昇順**で `{k:v}` 並べる
  - **Date**: `"__date__:<ISO8601>"`（`getTime()` が **有限値** の場合）。`getTime()` が `NaN` や `±Infinity` などの **非有限値** を返したときは `"__date__:invalid"` をセンチネルとして返し、例外は投げない。
  - **RegExp**: `typeSentinel("regexp", JSON.stringify([pattern, flags]))` を生成し、`"\u0000cat32:regexp:<payload>\u0000"` として JSON 文字列化する（`pattern = value.source`, `flags = value.flags`）。このセンチネルと同一の**文字列リテラル**が入力された場合は `__string__:` プレフィックスを段階的に重ねて衝突を回避する。
  - **Map**: `typeSentinel("map", payload)` 形式のセンチネル文字列（`"\u0000cat32:map:<payload>\u0000"`）。`payload` は `JSON.stringify` された
    `[propertyKey, serializedValue]` 配列。生成手順は以下の通り。
    1. 各エントリのキーと値をそれぞれ `stableStringify` する。キーは `toMapPropertyKey` を通じて `(bucketKey, propertyKey)` に正規化し、
       文字列キーは `propertyKey` にそのまま保持する（`propertykey` センチネルへ変換しない）。
    2. `bucketKey` ごとにエントリを集約し、`serializedKey` → `serializedValue` → 挿入順の優先度でソートする。
    3. 1 つの `bucketKey` に同一 `propertyKey` が複数存在する場合や型衝突がある場合は `typeSentinel("map-entry-index", JSON.stringify([bucketKey,
       propertyKey, uniqueIndex]))` を発番してキーの一意性を保証する。
    4. 正規化済みの `[propertyKey, serializedValue]` を配列化して `JSON.stringify` し、最後に `typeSentinel("map", payload)` で包む。
    - `typeSentinel("propertykey", ...)` は、`Symbol` キーや `bucketKey` 内での衝突解消時にのみ付与され、純粋な文字列キーとは区別して扱う。
    - 例: `stableStringify(new Map([["a", 1], ["b", "value"]]))` → `"\u0000cat32:map:[[\"a\",\"1\"],[\"b\",\"\\"value\\"\"]]\u0000"`
  - **Set**: `typeSentinel("set", payload)` 形式のセンチネル文字列。要素を `stableStringify` した結果と `buildSetSortKey` が返すセンチネル対応
    ソートキーで比較し、`sortKey` → `serializedValue` → 挿入順の優先度で整列した `serializedValue` の配列を `payload` (`"[... ]"`)
    として埋め込む。
    - 例: `stableStringify(new Set([1, 2]))` → `"\u0000cat32:set:[1,2]\u0000"`
  - `function`: `String(v)`
  - `symbol`: `"__symbol__:[...]"` 形式のセンチネル文字列（`global`/`local` 情報を JSON で保持）
  - **循環参照**を検出したら **`TypeError("Cyclic object")`** を投げる。
- 実装ノート:
  - JSON表現は**ASCIIエスケープ不要**（UTF‑8運用を前提）。
  - **typeSentinel**: `typeSentinel(type, payload)` は `"\u0000cat32:<type>:<payload>\u0000"` 文字列を生成し、直列化時の型識別と追加情報を保持する。TypedArray/ArrayBuffer/SharedArrayBuffer/Map のエントリや数値特異値などはこのセンチネルを介してエンコードする。
  - **Map/Set のセンチネル構造例**:
    ```
    // Map: 重複キーは map-entry-index で解消し、ソートキーの安定化を保持
    typeSentinel(
      "map",
      "[[\"\\u0000cat32:propertykey:string:\\"id\\"\\u0000\",\"123\"],[\"\\u0000cat32:propertykey:string:\\"tags\\"\\u0000\",\"[\\\"a\\\",\\\"b\\\"]\"]]"
    )

    // Set: ソート済み配列を JSON 文字列で保持
    typeSentinel(
      "set",
      "[\"123\",\"\\u0000cat32:number:NaN\\u0000\"]"
    )
    ```
  - **TypedArray**: `"\u0000cat32:typedarray:kind=<ViewName>;byteOffset=<n>;byteLength=<n>;length=<len?>;hex=<bytes>\u0000"`
    - `length` パラメータは `view.length` が存在する場合のみ付与。
    - バイト列は **16進小文字** (`00`-`ff`) で連結し、センチネル末尾 `\u0000` を付ける。
  - **ArrayBuffer**: `"\u0000cat32:arraybuffer:byteLength=<n>;hex=<bytes>\u0000"`
  - **SharedArrayBuffer**: `"\u0000cat32:sharedarraybuffer:byteLength=<n>;hex=<bytes>\u0000"`
    - ArrayBuffer/SharedArrayBuffer の各バイトも TypedArray と同様に 16進列へ変換。
  - 上記センチネル文字列は `stableStringify` が JSON 文字列として返し、`JSON.parse` するとセンチネル本体を得る。

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
- `Cat32`（§3 図中 `salted`）は `saltedKey = canonical + (ns ? "|saltns:" + JSON.stringify([salt, ns]) : salt ? "|salt:" + salt : "")` を生成する。
- `namespace` 指定時は **必ず** `|saltns:` に `[salt, namespace]` を **JSON 文字列**化したもの（例: `|saltns:["projX","v1"]`）を連結する。空白や追加区切りは入れない。
- `namespace` を省略した場合のみ、`|salt:` で `salt` 単体を連結する。
- 目的:
  - **salt**: システム間でバケット配置の**平行移動**（衝突回避／A/B切替）
  - **namespace**: **互換性が変わる**仕様変更を**明示的に切替**
- 互換性ノート: 初期ドラフトでは `|salt:` と `|ns:` を別々に連結していたが、現行仕様は `|saltns:` のみを使用する。既存データの移行時は接頭辞を確認して判別すること。

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
