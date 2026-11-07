"""On-the-fly hidden tests: frozen rules, cap and stratification, determinism, sealed-set guard."""

from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path

import pandas as pd
import pytest

from pipelines.tauchstone.adhoc import (
    SealedCandidateError,
    build_adhoc_tests,
    prereg_cohorts,
    prereg_theta,
    ranking_observations,
)
from pipelines.tauchstone.truth_table import TRUTH_TABLE_COLUMNS
from tests.tauchstone.adhoc_fixture import ADHOC, NO_EXPOSURE, SEALED, THIN, make_processed


@pytest.fixture()
def processed(tmp_path: Path) -> Path:
    return make_processed(tmp_path / "processed")


def test_prereg_values():
    assert prereg_cohorts() == ["GSE173955"]  # GSE53697 excluded by the frozen QC gate
    assert prereg_theta() == pytest.approx(-0.6644132522302304)


def test_rules(processed):
    df = build_adhoc_tests(ADHOC, processed)
    assert list(df.columns) == TRUTH_TABLE_COLUMNS
    by_type = Counter(df["context_type"])
    assert by_type == {"held_out_cohort": 1, "composition_adjusted": 1,
                       "lincs_context": 8, "brain_exposure": 1}
    row = df.set_index("context_id")
    assert row.loc["GSE173955", "outcome"] == "survive"  # rank 2 <= ceil(0.25 * 8)
    assert row.loc["GSE132903__composition_adjusted", "outcome"] == "fail"  # rank 5
    assert row.loc["brain_exposure", "outcome"] == "fail"  # measured Kp 0.05 < 0.1
    theta = prereg_theta()
    lincs = df[df["context_type"] == "lincs_context"]
    assert (lincs["threshold"] == theta).all()
    assert ((lincs["value"] <= theta) == (lincs["outcome"] == "survive")).all()
    assert set(df["candidate_id"]) == {ADHOC}


def test_cap_stratified_by_cell(processed):
    df = build_adhoc_tests(ADHOC, processed)
    cells = Counter(df.loc[df["context_type"] == "lincs_context", "cell_id"])
    assert cells == {"A549": 3, "MCF7": 3, "PC3": 2}  # round-robin over 6/4/2 held-out


def test_deterministic(processed):
    a = build_adhoc_tests(ADHOC, processed)
    b = build_adhoc_tests(ADHOC, processed)
    pd.testing.assert_frame_equal(a, b)


def test_no_measured_exposure_means_no_context(processed):
    df = build_adhoc_tests(NO_EXPOSURE, processed)
    assert "brain_exposure" not in set(df["context_type"])
    assert Counter(df["context_type"])["lincs_context"] == 1


def test_sealed_refused_and_truth_table_untouched(processed):
    tt = processed / "tauchstone" / "truth_table.parquet"
    before = hashlib.sha256(tt.read_bytes()).hexdigest()
    with pytest.raises(SealedCandidateError):
        build_adhoc_tests(SEALED, processed)
    build_adhoc_tests(ADHOC, processed)
    assert hashlib.sha256(tt.read_bytes()).hexdigest() == before


def test_unranked_or_unknown_is_empty(processed):
    assert build_adhoc_tests(THIN, processed).empty  # 2 ranking contexts: not rankable
    assert build_adhoc_tests("BRD-NOPE", processed).empty


def test_ranking_observations(processed):
    obs = ranking_observations(ADHOC, processed)
    assert len(obs) == 3 and set(obs["split"]) == {"ranking"}
    assert obs["survive"].tolist() == (obs["consensus"] <= prereg_theta()).tolist()
