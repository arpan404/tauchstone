"""Check 5 — the benchmark refuses unless the preregistration is frozen.

The real benchmark must not run on an unfrozen or dirty preregistration. These
tests exercise ``prereg_guard`` against temp copies (never the real file) and
confirm the real file currently passes the guard.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from pipelines.common.paths import MANIFESTS
from pipelines.tauchstone import truth_table as tt

needs_data = pytest.mark.data


def test_guard_refuses_unfrozen_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = MANIFESTS / "preregistration.yaml"
    if not src.exists():
        pytest.skip("preregistration.yaml absent")
    copy = tmp_path / "preregistration.yaml"
    shutil.copy(src, copy)
    doc = yaml.safe_load(copy.read_text())
    doc["status"] = "draft"
    copy.write_text(yaml.safe_dump(doc))
    monkeypatch.setattr(tt, "MANIFESTS", tmp_path)
    with pytest.raises(SystemExit, match="frozen"):
        tt.prereg_guard()


def test_guard_refuses_outside_git(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A frozen file that was never committed (temp dir, no git) must be refused."""
    src = MANIFESTS / "preregistration.yaml"
    if not src.exists():
        pytest.skip("preregistration.yaml absent")
    shutil.copy(src, tmp_path / "preregistration.yaml")
    monkeypatch.setattr(tt, "MANIFESTS", tmp_path)
    # Fail-closed either way: clean SystemExit, or the raw CalledProcessError from
    # the rev-parse call that sits outside the guard's try block (see qa_report F-02).
    with pytest.raises((SystemExit, subprocess.CalledProcessError)):
        tt.prereg_guard()


def test_real_prereg_passes_guard() -> None:
    """Read-only check on the real repo: the frozen file must satisfy the guard."""
    sha, commit = tt.prereg_guard()
    assert len(sha) == 64 and len(commit) >= 7
