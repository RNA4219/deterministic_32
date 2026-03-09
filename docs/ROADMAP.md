# deterministic_32: 状態と履歴

2026-03-09 時点で、このリポジトリは archive 扱いです。`package.json` の公開バージョンは `0.1.0` のまま維持し、以下は将来計画ではなく「到達した内容」と「未リリースの整理メモ」を残しています。

## 現在の扱い
- 新しい公開リリースは予定していません。
- 保守・検証は可能ですが、機能追加は原則停止です。
- docs/CLI/CI の改善はリポジトリ内には反映されていますが、追加の SemVer マイルストーンは切っていません。
- 凍結に合わせて reflection/analyze/report の補助運用はリポジトリから取り外しています。

## 公開済みベースライン
### v0.1.0 (公開済み / package.json)
- ライブラリ/CLI最小実装、NFKC 正規化、FNV-1a 32bit、`hash & 31`
- `labels(32)`/`salt`/`namespace`/`overrides`
- stableStringify（キー順・循環検出・Date/Map/Set/undefined）
- 基本テスト

## リポジトリ内で追加された整備
- `docs/API.md`・`docs/SPEC.md`・ADR整備、CLI改善（`--json`/`--pretty`）
- ベンチ整備と最小目標（Node 18 で 300k keys/sec 以上の目安）
- Actions（lint/build/test/release drafter）の整備
- Property test、Windows/Node 24 互換性、JSON reporter 周辺の修正

## 凍結メモ
- `v0.2.0` や `v1.0.0` の新規リリースは計画中ではありません。
- 追加作業を再開する場合は、このファイルの履歴メモではなく新しい release plan を起こしてください。
