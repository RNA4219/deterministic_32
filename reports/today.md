# Reflection Report (2025-10-18T08:46:01.709900)

- Total tests: 163
- Pass rate: 98.77%
- Duration p95: 66 ms
- Failures: 2

## Why-Why (draft)
- sample::wrapped-fail: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py は data.data のようなラップ構造から値を抽出する: 仮説=前処理の不安定/依存の競合/境界値不足
