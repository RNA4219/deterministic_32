---
intent_id: INT-001
owner: your-handle
status: active   # draft|active|deprecated
last_reviewed_at: 2025-10-14
next_review_due: 2025-11-14
---

# Runbook

## Environments

- Local / CI / Prod の差分（キー名だけ列挙）

## Execute

- 準備 → 実行 → 確認（最短手順）
- 例）
  - 準備: データ投入 / キャッシュ初期化
  - 実行: コマンド/ジョブ名
  - 確認: 出力の存在・件数・整合
- 設定差分検証（責任者: Release エンジニア）
  - デプロイ前: `scripts/dump_env.sh > logs/env.before` で本番環境変数を保存し、`config/prod.yaml` など対象設定ファイルを `cp config/prod.yaml logs/config.prod.before` に退避
  - デプロイ後: `scripts/dump_env.sh > logs/env.after` を取得し、`diff -u logs/env.before logs/env.after` と `diff -u logs/config.prod.before config/prod.yaml` で環境変数・設定ファイルの差分を確認し、想定外差分がないことを Slack #release に記録

## Observability

- ログ/メトリクスの確認点、失敗時の兆候
- インシデント発生時は docs/IN-YYYYMMDD-XXX.md に記録し、最新サンプル（[IN-20250115-001](docs/IN-20250115-001.md)）を参照して検知ログ・メトリクスの抜粋を添付

## Rollback / Retry

- どこまで戻すか、再実行条件
- インシデントサマリを更新後、該当PRの説明欄と本RUNBOOKの該当セクションにリンクを追加する
- ロールバック後差分確認（責任者: SRE オンコール）
  - ロールバック前: 現行の `logs/env.after` を `logs/env.rollback.before` にコピーし、`config/prod.yaml` を `logs/config.prod.rollback.before` に退避
  - ロールバック後: `scripts/dump_env.sh > logs/env.rollback.after` を取得し、`diff -u logs/env.rollback.before logs/env.rollback.after` と `diff -u logs/config.prod.rollback.before config/prod.yaml` で環境変数・設定ファイルがデプロイ前状態へ戻っていることを確認し、結果をインシデントノートに追記
