import json, statistics, pathlib, os, datetime, math
from collections import Counter
from typing import Optional, Tuple


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
    return int(math.ceil(interpolated))

LOG = pathlib.Path(os.environ.get("ANALYZE_LOG_PATH", "logs/test.jsonl"))
REPORT = pathlib.Path(os.environ.get("ANALYZE_REPORT_PATH", "reports/today.md"))
ISSUE_OUT = pathlib.Path(os.environ.get("ANALYZE_ISSUE_PATH", "reports/issue_suggestions.md"))

def extract_duration(entry: dict[str, object]) -> int:
    duration = entry.get("duration_ms")
    if duration is None:
        data = entry.get("data")
        if isinstance(data, dict):
            duration = data.get("duration_ms")
    if duration is None:
        return 0
    if isinstance(duration, (int, float)):
        return int(duration)
    if isinstance(duration, str):
        try:
            return int(float(duration))
        except ValueError:
            return 0
    return 0


ALLOWED_EVENT_TYPES = {"test:pass", "test:fail"}
_NESTED_DATA_KEYS: tuple[str, ...] = ("data", "test")


def _extract_numeric_duration(value: object) -> int:
    if isinstance(value, (int, float)):
        return int(round(value))
    return 0


def _as_mapping(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    return {}


def _unwrap_payload(payload: dict[str, object]) -> dict[str, object]:
    current = payload
    seen: set[int] = set()
    while True:
        identifier = id(current)
        if identifier in seen:
            return current
        seen.add(identifier)
        if any(field in current for field in ("name", "duration_ms", "status", "ok", "details")):
            return current
        for key in _NESTED_DATA_KEYS:
            candidate = current.get(key)
            if isinstance(candidate, dict):
                current = candidate
                break
        else:
            return current


def _extract_duration(payload: dict[str, object]) -> int:
    if "duration_ms" in payload:
        return _extract_numeric_duration(payload.get("duration_ms"))
    details = payload.get("details")
    if isinstance(details, dict) and "duration_ms" in details:
        return _extract_numeric_duration(details.get("duration_ms"))
    return 0


ParsedEntry = Tuple[str, int, bool]


def _load_from_event(obj: dict[str, object]) -> Optional[ParsedEntry]:
    event_type = obj.get("type")
    if not isinstance(event_type, str):
        return None
    if event_type not in ALLOWED_EVENT_TYPES:
        return None
    data = _unwrap_payload(_as_mapping(obj.get("data")))
    name = data.get("name")
    if not isinstance(name, str):
        name = ""
    duration = _extract_duration(data)
    is_failure = event_type == "test:fail"
    return name, duration, is_failure


def _load_from_legacy(obj: dict[str, object]) -> Optional[ParsedEntry]:
    status = obj.get("status")
    if not isinstance(status, str):
        return None
    name = obj.get("name")
    if not isinstance(name, str):
        name = ""
    duration = extract_duration(obj)
    status = obj.get("status")
    is_failure = status == "fail"
    return name, duration, is_failure
    
def _load_entry(obj: object) -> Optional[Tuple[str, int, bool]]:
    if not isinstance(obj, dict):
        return None
    event_type = obj.get("type")
    if isinstance(event_type, str):
        if event_type not in ALLOWED_EVENT_TYPES:
            return None
        return _load_from_event(obj)
    return _load_from_legacy(obj)


def load_results() -> Tuple[list[str], list[int], list[str]]:
    tests: list[str] = []
    durs: list[int] = []
    fails: list[str] = []
    if not LOG.exists():
        return tests, durs, fails
    with LOG.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj = json.loads(line)
            if not isinstance(obj, dict):
                continue
            event_type = obj.get("type")
            parsed: Optional[ParsedEntry]
            if isinstance(event_type, str):
                if event_type not in ALLOWED_EVENT_TYPES:
                    continue
                parsed = _load_from_event(obj)
            else:
                parsed = _load_from_legacy(obj)
            if parsed is None:
                continue
            name, duration, is_failure = parsed
            tests.append(name)
            durs.append(duration)
            if is_failure:
                fails.append(name)
    return tests, durs, fails

def main() -> None:
    tests, durs, fails = load_results()
    total = len(tests)
    if total == 0:
        pass_rate = 0.0
    else:
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
