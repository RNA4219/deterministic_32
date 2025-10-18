import json, statistics, pathlib, os, datetime, math
from collections import Counter
from typing import Optional, Tuple


_DEFAULT_LOG = pathlib.Path("logs/test.jsonl")
_DEFAULT_REPORT = pathlib.Path("reports/today.md")
_DEFAULT_ISSUE = pathlib.Path("reports/issue_suggestions.md")


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


def format_pass_rate(total_tests: int, failure_count: int) -> str:
    if total_tests <= 0:
        return "0%"
    failures = max(failure_count, 0)
    rate = (total_tests - failures) / total_tests
    if rate < 0:
        rate = 0.0
    elif rate > 1:
        rate = 1.0
    return f"{rate:.2%}"

def _resolve_path(env_key: str, default: pathlib.Path) -> pathlib.Path:
    value = os.environ.get(env_key)
    if value is None:
        return default
    text = value.strip()
    if not text:
        return default
    return pathlib.Path(text)


LOG = _resolve_path("ANALYZE_LOG_PATH", _DEFAULT_LOG)
REPORT = _resolve_path("ANALYZE_REPORT_PATH", _DEFAULT_REPORT)
ISSUE_OUT = _resolve_path("ANALYZE_ISSUE_PATH", _DEFAULT_ISSUE)


def _log_path() -> pathlib.Path:
    global LOG
    LOG = _resolve_path("ANALYZE_LOG_PATH", _DEFAULT_LOG)
    return LOG


def _report_path() -> pathlib.Path:
    global REPORT
    REPORT = _resolve_path("ANALYZE_REPORT_PATH", _DEFAULT_REPORT)
    return REPORT


def _issue_path() -> pathlib.Path:
    global ISSUE_OUT
    ISSUE_OUT = _resolve_path("ANALYZE_ISSUE_PATH", _DEFAULT_ISSUE)
    return ISSUE_OUT


def _clear_issue_report(issue_path: pathlib.Path) -> None:
    try:
        issue_path.unlink()
    except FileNotFoundError:
        return
    except OSError:
        try:
            issue_path.write_text("", encoding="utf-8")
        except OSError:
            pass

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
    status = obj.get("status")
    if status not in {"pass", "fail", "skip"}:
        return None
    duration = extract_duration(obj)
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
    log_path = _log_path()
    if not log_path.exists():
        return tests, durs, fails
    with log_path.open(encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            loaded = _load_entry(obj)
            if loaded is None:
                continue
            name, duration, is_failure = loaded
            tests.append(name)
            durs.append(duration)
            if is_failure:
                fails.append(name)
    return tests, durs, fails

def main() -> None:
    tests, durs, fails = load_results()
    total = len(tests)
    failure_count = len(fails)
    pass_rate_text = format_pass_rate(total, failure_count)
    p95 = compute_p95(durs)
    now = datetime.datetime.utcnow().isoformat()
    report_path = _report_path()
    issue_path = _issue_path()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as f:
        f.write(f"# Reflection Report ({now})\n\n")
        f.write(f"- Total tests: {total}\n")
        f.write(f"- Pass rate: {pass_rate_text}\n")
        f.write(f"- Duration p95: {p95} ms\n")
        f.write(f"- Failures: {failure_count}\n\n")
        if fails:
            f.write("## Why-Why (draft)\n")
            for name, cnt in Counter(fails).items():
                f.write(f"- {name}: 仮説=前処理の不安定/依存の競合/境界値不足\n")
    if fails:
        issue_path.parent.mkdir(parents=True, exist_ok=True)
        with issue_path.open("w", encoding="utf-8") as f:
            f.write("### 反省TODO\n")
            for name in set(fails):
                f.write(f"- [ ] {name} の再現手順/前提/境界値を追加\n")
    else:
        _clear_issue_report(issue_path)
if __name__ == "__main__":
    main()
