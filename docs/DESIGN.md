# DESIGN: deterministic-32（実装設計）

## 1. モジュール構成（TS 推奨）
```
src/
  hash.ts          // FNV-1a32（UTF-8）
  serialize.ts     // stableStringify（循環検出・Map/Set/Date 規約）
  categorizer.ts   // Cat32：salt/ns/labels/overrides を束ねる
  index.ts         // export
  cli.ts           // 標準入力/引数→NDJSON(既定)/整形 JSON で Assignment 出力
tests/
  *.test.ts        // プロパティ/回帰テスト
```

## 2. 主要クラス
- `Cat32`:
  - `constructor(opts)` で `labels(32)`, `salt`, `namespace`, `normalize`, `overrides` を受け取る。
  - `assign(input)` → `{ index, label, hash, key }`
  - `index(input)`, `labelOf(input)`：利便性ラッパー。
  - `salt`/`namespace` の連結は `canonical + (ns ? "|saltns:" + JSON.stringify([salt, ns]) : salt ? "|salt:" + salt : "")` を厳守する（§7）。旧プロトタイプの `|salt:` + `|ns:` 形式はサポートしない。

## 3. 正規化戦略
- 既定は **NFKC**。半角/全角、互換文字等の揺れを低減。
- 互換性維持のため、将来の変更は `namespace` を増やして切替。

## 4. 直列化の詳細（serialize.ts）
- **循環検出**は `Set<object>` スタックで実施。
- **Map/Set**:
  - Map: 直列化キーは `typeSentinel("propertykey", ...)` や `typeSentinel("map-entry-index", ...)` を含む**正規化キー**へ変換する。処理は次の 4 ステップでセンチネル化され、最終的に `typeSentinel("map", payload)` にまとめられる。
    1. 各エントリのキーと値をそれぞれ `stableStringify` し、キーは `toMapPropertyKey` で `(bucketKey, propertyKey)` に分解する。`bucketKey` には型タグ（`symbol`、`set`、`arraybuffer` など）とセンチネル化済みキー情報を含める。
    2. `bucketKey` 単位でエントリを集約し、`serializedKey` → `serializedValue` → 挿入順の優先度でソートする。
    3. 同一 `bucketKey` に `propertyKey` が重複する場合や型衝突がある場合は `typeSentinel("map-entry-index", JSON.stringify([bucketKey, propertyKey, uniqueIndex]))` を付与してキーの一意性を保証する。
    4. 正規化済みの `[propertyKey, serializedValue]` 配列を `JSON.stringify` し、最後に `typeSentinel("map", payload)` で包む。
- Set: 要素の `stableStringify` 結果と `buildSetSortKey` が返すセンチネル対応ソートキーで比較し、`sortKey` → `serializedValue` → 挿入順の優先度で整列した配列を `payload` (`"[... ]"`) として `typeSentinel("set", payload)` に埋め込む。重複要素も同じ順序規則で保持される。
- **Date**: `__date__:<ISO8601>`
- **RegExp**: `typeSentinel("regexp", JSON.stringify([value.source, value.flags]))` を構築し、`"\u0000cat32:regexp:<payload>\u0000"` 文字列として返す。`value.flags` は JavaScript の既定どおり ASCII 昇順で整列済み（例: `gi` → `"gi"`）。
- `undefined` は `"__undefined__"` の**文字列**にエンコード。
- 文字列は `__string__:` プレフィックスでセンチネル衝突を避ける。対象は RegExp センチネルを含む `\u0000cat32:*` 系や `__undefined__` 等で、既存プレフィックスを解除しても安全でない場合は多重に付与する。

## 5. 文字コードとランタイム
- UTF‑8 バイト化は `TextEncoder`（ブラウザ/Node18+）で統一。
- Node <18 互換は非目標（必要なら polyfill）。

## 6. CLI（cli.ts）
- 引数: `--salt=... --namespace=... --normalize=nfkc|nfkd|nfd|nfc|none`
- 正規化モード: `nfkc`（既定）、`nfkd`、`nfd`、`nfc`、`none` の 5 種類を許可。
- 入力: 引数 `<key>` がなければ **stdin** を読む。
- 出力: 既定/`compact` モードは **NDJSON**（1 行 1 JSON）で `Assignment` を出力。
- 整形モード（`--json=pretty`/`--pretty`/`--json --pretty`）は複数行の整形 JSON を返し、NDJSON とは異なる。
- 失敗コード: `2`（循環/ラベル不正など）、`1`（その他）。

## 7. 性能
- 時間計算量: `O(len(utf8))`
- メモリ: 直列化したキー長 + 事前確保数個のオブジェクトのみ
- 参考実装: Node18 で 300k keys/sec 程度（環境依存）。

## 8. テレメトリ（任意）
- index 分布のヒストグラムで偏りを検知。

## 9. 拡張ポイント
- 64分割版・可変分割版は**別パッケージ**を推奨。
