# CI テスト評価メモ

## ワークフロー構成の概要
- `.github/workflows/test.yml` は Node 18/20 のマトリクスで `npm run build` と `node --test dist/tests` を実行。
- ビルド前に TypeScript コンパイラを `npm install --no-save typescript` で導入し、`dist/tests` に配置されたテストを TAP 形式で収集。
- 生成した TAP を JSONL に変換し、`logs` アーティファクトとして保存。

## 現状テスト網羅性の評価
- 主要ユースケース: `tests/` ディレクトリに 2 本 (カテゴリ生成、ベクタ検証) のテストが存在し、CLI 振る舞いの自動テストは未実装。
- タイプチェック: `npm run build` (tsc) で型エラーを検出可能だが、`tsconfig.json` の `noEmitOnError` 依存のため、CI 側で明示的な `tsc --noEmit` があると安全性向上。
- Lint: リポジトリに lint 実行コマンドが存在せず、スタイル/静的解析は未カバー。
- プラットフォーム: Node 18/20 のみ。Windows/macOS での CLI 動作検証や非 x64 アーキは対象外。

## 推奨アクション
1. CLI (`dist/cli.js`) を対象に node:test で簡易 E2E (help 表示・標準入出力) を追加検討。
2. TypeScript コンパイルを `npm run build` 依存ではなく、`tsc --noEmit` を並列ジョブとして追加するとエラー検出が明確。
3. Lint 方針 (例: ESLint または Biome) を決定し、CI に静的解析ステップを導入。
4. クロスプラットフォーム互換性が重要な場合は `runs-on: macos-latest`, `runs-on: windows-latest` のスポットチェックを計画。

## 結論
- 現状でも型エラーとユニットテストは通過するが、CLI や静的解析を含むカバレッジが不足。上記推奨アクションで品質リスクを低減できる。
