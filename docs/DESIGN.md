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

## 3. 正規化戦略
- 既定は **NFKC**。半角/全角、互換文字等の揺れを低減。
- 互換性維持のため、将来の変更は `namespace` を増やして切替。

## 4. 直列化の詳細（serialize.ts）
- **循環検出**は `Set<object>` スタックで実施。
- **Map/Set**:
  - Map: `[...map.entries()].map(k→String(k)).sort()` でキー整列 → `{"k":v}` 形式
  - Set: `Array.from(set).map(stableStringify).sort()` で**文字列昇順**に並べる（順序安定化）
- **Date**: `__date__:<ISO8601>`
- `undefined` は `"__undefined__"` の**文字列**にエンコード。

## 5. 文字コードとランタイム
- UTF‑8 バイト化は `TextEncoder`（ブラウザ/Node18+）で統一。
- Node <18 互換は非目標（必要なら polyfill）。

## 6. CLI（cli.ts）
- 引数: `--salt=... --namespace=... --normalize=nfkc|nfkd|nfc|none`
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
