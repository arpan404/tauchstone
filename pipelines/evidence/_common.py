"""Shared helpers for WS4 evidence builders."""

from __future__ import annotations

from pathlib import Path

from pipelines.common.paths import RAW
from pipelines.common.provenance import raw_checksum

OT_RELEASE = "26.09"
OT_DIR = RAW / "evidence" / "open_targets" / OT_RELEASE
AD_ID = "MONDO_0004975"


def raw_inputs(*paths: Path) -> dict[str, str | None]:
    """Manifest checksums for raw files, keyed RAW-relative (as frozen by fetch_data)."""
    out: dict[str, str | None] = {}
    for p in paths:
        try:
            key = str(p.relative_to(RAW))
        except ValueError:
            key = str(p)
        out[key] = raw_checksum(key)
    return out


def chembl_card_url(chembl_id: str) -> str:
    return f"https://www.ebi.ac.uk/chembl/compound_report_card/{chembl_id}/"


def ot_evidence_url(ensembl_id: str) -> str:
    return f"https://platform.opentargets.org/evidence/{ensembl_id}/{AD_ID}"


def hpa_brain_url(ensembl_id: str) -> str:
    return f"https://www.proteinatlas.org/{ensembl_id}/brain"
