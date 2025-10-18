# Reflection Report (2025-10-18T06:24:14.299531)

- Total tests: 159
- Pass rate: 98.74%
- Duration p95: 68 ms
- Failures: 2

## Why-Why (draft)
- sample::failing: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py は data.data のようなラップ構造から値を抽出する: 仮説=前処理の不安定/依存の競合/境界値不足
