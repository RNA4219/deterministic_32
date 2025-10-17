import json, statistics, pathlib, datetime
from collections import Counter
from typing import Tuple


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

LOG = pathlib.Path("logs/test.jsonl")
REPORT = pathlib.Path("reports/today.md")
ISSUE_OUT = pathlib.Path("reports/issue_suggestions.md")

def load_results() -> Tuple[list[str], list[int], list[str]]:
    tests: list[str] = []
    durs: list[int] = []
    fails: list[str] = []
    if not LOG.exists():
        return tests, durs, fails
    with LOG.open(encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            obj = json.loads(line)
            payload = obj.get("data")
            if not isinstance(payload, dict):
                continue

            name_value = payload.get("name")
            if isinstance(name_value, str):
                test_name = name_value
            elif name_value is not None:
                test_name = str(name_value)
            else:
                test_name = None

            event_type = obj.get("type")
            status_value = payload.get("status")

            is_test_event = False
            is_failure = False

            if isinstance(event_type, str):
                if event_type.startswith("test:"):
                    is_test_event = True
                    if event_type.endswith(":fail"):
                        is_failure = True
                    elif event_type.endswith(":pass"):
                        is_failure = False
                elif event_type in {"pass", "fail"}:
                    is_test_event = True
                    is_failure = event_type == "fail"

            if isinstance(status_value, str):
                normalized = status_value.lower()
                if normalized in {"pass", "fail"}:
                    is_test_event = True
                    if normalized == "fail":
                        is_failure = True

            if not is_test_event:
                continue

            duration_value = payload.get("duration_ms", 0)
            duration_ms = 0
            if isinstance(duration_value, (int, float)):
                duration_ms = int(duration_value)
            else:
                try:
                    duration_ms = int(float(duration_value))
                except (TypeError, ValueError):
                    duration_ms = 0

            if test_name is None:
                test_name = event_type if isinstance(event_type, str) else "unknown"

            tests.append(test_name)
            durs.append(duration_ms)
            if is_failure:
                fails.append(test_name)
    return tests, durs, fails


def calculate_p95(durations: list[int]) -> int:
    if len(durations) >= 2:
        return int(statistics.quantiles(durations, n=20)[18])
    if durations:
        return int(durations[0])
    return 0


def main():
    tests, durs, fails = load_results()
    total = len(tests) or 1
    pass_rate = (total - len(fails)) / total
    p95 = calculate_p95(durs)
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
        with ISSUE_OUT.open("w", encoding="utf-8") as f:
            f.write("### 反省TODO\n")
            for name in set(fails):
                f.write(f"- [ ] {name} の再現手順/前提/境界値を追加\n")
if __name__ == "__main__":
    main()
