"""WS8 helper: locate $TS_DATA_DIR/processed and skip when real files are absent."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

PROCESSED = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"

MAIN_RANKING = "scores/GSE132903__main__compound_ranking.parquet"
MAIN_CONTEXT = "scores/GSE132903__main__context_scores.parquet"
MAIN_SIGNATURE_SCORES = "scores/GSE132903__main__signature_scores.parquet"
POOL = "scores/GSE132903__main__candidate_pool.parquet"
GOLD_NULL = "scores/GSE132903__gold_permctl__permutation_null.parquet"
GOLD_SUMMARY = "scores/GSE132903__gold_permctl__permutation_summary.parquet"
GOLD_RANKING = "scores/GSE132903__gold_permctl__compound_ranking.parquet"
ALL_NULL = "scores/GSE132903__permctl__permutation_null.parquet"
ALL_SUMMARY = "scores/GSE132903__permctl__permutation_summary.parquet"
TRUTH = "tauchstone/truth_table.parquet"
EXPOSURE = "evidence/exposure.parquet"
MAIN_SIGNATURE = "signatures/GSE132903__main.parquet"
GOLD_PERM_PROV = GOLD_NULL + ".provenance.json"

needs_data = pytest.mark.data


def require(*rels: str) -> None:
    missing = [r for r in rels if not (PROCESSED / r).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
