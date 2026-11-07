"""Known-check test on real processed data (Track D1 gaps). Skips without data."""

import json
import os
from pathlib import Path

import pandas as pd
import pytest

from pipelines.evidence.gaps import derive_gaps, load_theta

pytestmark = pytest.mark.data

DATA = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"
NEED = [
    "scores/GSE132903__main__compound_ranking.parquet",
    "scores/GSE132903__main__context_scores.parquet",
    "evidence/exposure.parquet",
    "evidence/targets.parquet",
]


def _load():
    missing = [f for f in NEED if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    ranking = pd.read_parquet(DATA / "scores" / "GSE132903__main__compound_ranking.parquet")
    context = pd.read_parquet(DATA / "scores" / "GSE132903__main__context_scores.parquet")
    exposure = pd.read_parquet(DATA / "evidence" / "exposure.parquet")
    targets = pd.read_parquet(DATA / "evidence" / "targets.parquet")
    return ranking, context, exposure, targets


def test_gaps_piperacillin_known_checks():
    ranking, context, exposure, targets = _load()
    gaps = derive_gaps(ranking, context, exposure, targets, load_theta())
    assert len(gaps) == len(ranking) == 5690
    row = gaps[gaps["pert_id"] == "BRD-K86873305"].iloc[0]
    assert row["cancer_lines_only"]
    assert list(row["doses_um"]) == pytest.approx([10.0])
    assert list(row["times_h"]) == pytest.approx([6.0])
    assert row["exposure_level"] == "predicted"
    assert row["exposure_label"] == "predicted low"
    assert not row["has_targets"]


def test_gaps_cholic_acid_brain_cells():
    ranking, context, exposure, targets = _load()
    gaps = derive_gaps(ranking, context, exposure, targets, load_theta())
    row = gaps[gaps["pert_id"] == "BRD-K43164539"].iloc[0]
    brain = {b["cell_id"]: b for b in json.loads(row["brain_cells_json"])}
    assert "NEU" in brain
    assert brain["NEU"]["consensus"] == pytest.approx(-0.66, abs=0.01)
    assert not row["cancer_lines_only"]
