from __future__ import annotations

import re
from pathlib import Path

import pytest

RUNBOOK_PATH = Path(__file__).resolve().parents[1] / "RUNBOOK.md"


@pytest.fixture(scope="module")
def runbook_text() -> str:
    return RUNBOOK_PATH.read_text(encoding="utf-8")


def extract_section(text: str, heading: str) -> str:
    pattern = rf"^## {re.escape(heading)}\n(.*?)(?=\n## |\Z)"
    match = re.search(pattern, text, flags=re.MULTILINE | re.DOTALL)
    if match is None:
        raise AssertionError(f"heading '{heading}' not found in RUNBOOK")
    return match.group(1)


@pytest.mark.parametrize(
    ("heading", "patterns"),
    (
            (
                "Execute",
                (
                    r"環境変数",
                    r"設定(?:ファイル)?",
                    r"diff",
                    r"(責任者|担当)",
                ),
            ),
            (
                "Rollback / Retry",
                (
                    r"環境変数",
                    r"設定(?:ファイル)?",
                    r"diff",
                    r"(責任者|担当)",
                ),
            ),
    ),
)
def test_runbook_sections_include_diff_validation(runbook_text: str, heading: str, patterns: tuple[str, ...]) -> None:
    section = extract_section(runbook_text, heading)
    for pattern in patterns:
        if re.search(pattern, section, flags=re.DOTALL) is None:
            pytest.fail(f"Pattern '{pattern}' not found in section '{heading}'")
