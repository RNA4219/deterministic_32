# Reflection Report (2025-10-18T06:21:18.392269)

- Total tests: 164
- Pass rate: 97.56%
- Duration p95: 85 ms
- Failures: 4

## Why-Why (draft)
- sample::fail: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py は非テストイベントを集計に含めない: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py は JSONL ログから pass/fail を集計する: 仮説=前処理の不安定/依存の競合/境界値不足
- analyze.py はテストが存在しない場合に 0 件として集計する: 仮説=前処理の不安定/依存の競合/境界値不足
