# ADR-0001: Categorizer Design
- FNV-1a 32-bit、NFKC 既定、`namespace` で互換性切替、`salt` で平行移動
- stableStringify で順序非依存（キーソート・循環検出・Date/Map/Set/undefined）
