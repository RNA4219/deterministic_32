import importlib.util
import pathlib
from types import ModuleType
from unittest import mock

import pytest


def _load_analyze_module() -> ModuleType:
    module_path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "analyze.py"
    spec = importlib.util.spec_from_file_location("scripts.analyze", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load scripts.analyze module for testing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


analyze = _load_analyze_module()


def test_clear_issue_report_raises_when_fallback_write_fails(tmp_path: pathlib.Path) -> None:
    issue_path = tmp_path / "issue.md"

    with (
        mock.patch.object(pathlib.Path, "unlink", side_effect=OSError("unlink error")) as unlink_mock,
        mock.patch.object(pathlib.Path, "write_text", side_effect=OSError("write error")) as write_mock,
    ):
        with pytest.raises(RuntimeError) as exc_info:
            analyze._clear_issue_report(issue_path)

    unlink_mock.assert_called_once()
    write_mock.assert_called_once()
    args, kwargs = write_mock.call_args
    assert args == ("",)
    assert kwargs == {"encoding": "utf-8"}
    message = str(exc_info.value)
    assert "issue.md" in message
    assert "write error" in message
