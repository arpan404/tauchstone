"""Check 10 — clinical-language scan of web and API sources.

Fails on 'treat', 'cure', 'effective', 'safe', 'dose recommendation' or
'efficacy' outside the approved boundary-banner wording ('Not a treatment
recommendation ... does not establish efficacy, safety, dosing ...') and
outside inert identifier substrings (e.g. ``effectivePicked``).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOTS = [REPO / "apps" / "web" / "src", REPO / "services" / "api"]
SUFFIXES = {".ts", ".tsx", ".py"}
PATTERN = re.compile(r"treat|cure|effective|safe|dose recommendation|efficacy", re.IGNORECASE)
ALLOW_SUBSTRING = re.compile(r"effectivePicked|effectively|motion-safe|cycle-safe")
ALLOW_LINE = re.compile(
    r"Research hypothesis only|Not a treatment recommendation|does not establish|"
    r"Target context only|Not evidence|read-only|Read-only"
)


def test_no_clinical_language() -> None:
    hits: list[str] = []
    for root in ROOTS:
        assert root.exists(), f"scan root missing: {root}"
        for path in sorted(root.rglob("*")):
            if path.suffix not in SUFFIXES or not path.is_file():
                continue
            for i, line in enumerate(path.read_text().splitlines(), 1):
                if not PATTERN.search(line):
                    continue
                stripped = ALLOW_SUBSTRING.sub("", line)
                if not PATTERN.search(stripped):
                    continue
                if ALLOW_LINE.search(line):
                    continue
                hits.append(f"{path.relative_to(REPO)}:{i}: {line.strip()[:160]}")
    assert not hits, "clinical language outside the boundary banner:\n" + "\n".join(hits)
