"""EVALUATION.md の Acceptance Criteria を検証するテスト。"""

from __future__ import annotations

from pathlib import Path


def _load_acceptance_criteria() -> list[str]:
    evaluation_path = Path(__file__).resolve().parents[1] / "EVALUATION.md"
    content = evaluation_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    criteria: list[str] = []
    in_section = False
    for line in lines:
        if line.startswith("## ") and in_section:
            break
        if line.strip() == "## Acceptance Criteria":
            in_section = True
            continue
        if in_section and line.strip().startswith("- "):
            criteria.append(line.strip()[2:])

    return criteria


def test_acceptance_criteria_contains_environment_diff_check() -> None:
    criteria = _load_acceptance_criteria()
    assert any("設定差分チェック" in item for item in criteria), (
        "Acceptance Criteria に環境設定差分をレビューするチェック項目がありません"
    )
