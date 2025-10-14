# deterministic_32: ロードマップ

目的：**32分割の決定的カテゴリ付け**を、依存ゼロ・Node/ブラウザ両対応で提供。

## マイルストーン
### v0.1.0 (MVP) — 2025-10-15
- ライブラリ/CLI最小実装、NFKC 正規化、FNV-1a 32bit、`hash & 31`
- `labels(32)`/`salt`/`namespace`/`overrides`
- stableStringify（キー順・循環検出・Date/Map/Set/undefined）
- 基本テスト

### v0.2.0 (Docs & DX) — 2025-10-22
- `docs/API.md`・`docs/SPEC.md`・ADR整備、CLI改善（--json/--pretty）
- ベンチと最小目標（Node18で 300k keys/sec 以上の目安）
- Actions（Lint/Build/Test/Release Draft）

### v1.0.0 (API Freeze) — 2025-11-14
- API凍結（SemVer）、Fuzz/Propertyテスト、サイズ目標（<10KB gz 目安）
