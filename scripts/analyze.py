import json, statistics, pathlib, os, datetime
from collections import Counter


def compute_p95(durations: list[int]) -> int:
    if not durations:
        return 0
    if len(durations) >= 20:
        return int(statistics.quantiles(durations, n=20)[18])
    ordered = sorted(durations)
    if len(ordered) == 1:
        return int(ordered[0])
    position = 0.95 * (len(ordered) - 1)
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(ordered) - 1)
    fraction = position - lower_index
    interpolated = ordered[lower_index] + (ordered[upper_index] - ordered[lower_index]) * fraction
    return int(interpolated)

LOG = pathlib.Path(os.environ.get("ANALYZE_LOG_PATH", "logs/test.jsonl"))
REPORT = pathlib.Path(os.environ.get("ANALYZE_REPORT_PATH", "reports/today.md"))
ISSUE_OUT = pathlib.Path(os.environ.get("ANALYZE_ISSUE_PATH", "reports/issue_suggestions.md"))

def load_results():
    tests, durs, fails = [], [], []
    if not LOG.exists():
        return tests, durs, fails
    with LOG.open() as f:
        for line in f:
            obj = json.loads(line)
            tests.append(obj.get("name"))
            durs.append(obj.get("duration_ms", 0))
            if obj.get("status") == "fail":
                fails.append(obj.get("name"))
    return tests, durs, fails

def main():
    tests, durs, fails = load_results()
    total = len(tests) or 1
    pass_rate = (total - len(fails)) / total
    p95 = compute_p95(durs)
    now = datetime.datetime.utcnow().isoformat()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", encoding="utf-8") as f:
        f.write(f"# Reflection Report ({now})\n\n")
        f.write(f"- Total tests: {total}\n")
        f.write(f"- Pass rate: {pass_rate:.2%}\n")
        f.write(f"- Duration p95: {p95} ms\n")
        f.write(f"- Failures: {len(fails)}\n\n")
        if fails:
            f.write("## Why-Why (draft)\n")
            for name, cnt in Counter(fails).items():
                f.write(f"- {name}: 仮説=前処理の不安定/依存の競合/境界値不足\n")
    if fails:
        ISSUE_OUT.parent.mkdir(parents=True, exist_ok=True)
        with ISSUE_OUT.open("w", encoding="utf-8") as f:
            f.write("### 反省TODO\n")
            for name in set(fails):
                f.write(f"- [ ] {name} の再現手順/前提/境界値を追加\n")
if __name__ == "__main__":
    main()
