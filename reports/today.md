# Reflection Report (2025-10-18T07:50:19.135442)

- Total tests: 159
- Pass rate: 99.37%
- Duration p95: 59 ms
- Failures: 1

## Why-Why (draft)
- analyze.py はテストが存在しない場合に 0 件として集計する: 仮説=前処理の不安定/依存の競合/境界値不足
