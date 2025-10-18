# Reflection Report (2025-10-18T06:21:37.378157)

- Total tests: 162
- Pass rate: 98.77%
- Duration p95: 83 ms
- Failures: 2

## Why-Why (draft)
- sample::wrapped-fail: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py は JSONL ログから pass/fail を集計する: 仮説=前処理の不安定/依存の競合/境界値不足
