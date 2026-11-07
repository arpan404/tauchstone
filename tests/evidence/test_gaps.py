import json

import pandas as pd
import pytest

from pipelines.evidence.gaps import NEURAL_CELLS, derive_gaps, load_theta, parse_dose_um, parse_time_h

THETA = -0.6644132522302304


def _frames():
    ranking = pd.DataFrame(
        [
            {"pert_id": "BRD-X1", "pert_iname": "drug-a", "consensus_median": -1.0,
             "z_wtcs_median": -1.0, "z_ks_median": -1.0, "z_cosine_median": -1.0,
             "n_ranking_contexts": 3},
            {"pert_id": "BRD-X2", "pert_iname": "drug-b", "consensus_median": 0.5,
             "z_wtcs_median": 0.5, "z_ks_median": 0.5, "z_cosine_median": 0.5,
             "n_ranking_contexts": 2},
        ]
    )
    context = pd.DataFrame(
        [
            {"pert_id": "BRD-X1", "context_id": "c1", "split": "ranking", "cell_id": "MCF7",
             "pert_idose": "10 uM", "pert_itime": "6 h", "consensus": -1.0},
            {"pert_id": "BRD-X1", "context_id": "c2", "split": "ranking", "cell_id": "NEU",
             "pert_idose": "10 uM", "pert_itime": "24 h", "consensus": -0.9},
            {"pert_id": "BRD-X1", "context_id": "c3", "split": "ranking", "cell_id": "NEU",
             "pert_idose": "500 nM", "pert_itime": "24 h", "consensus": -0.5},
            # Held-out rows must never feed the gaps.
            {"pert_id": "BRD-X1", "context_id": "h1", "split": "held_out", "cell_id": "SHSY5Y",
             "pert_idose": "10 uM", "pert_itime": "6 h", "consensus": -3.0},
            {"pert_id": "BRD-X2", "context_id": "c4", "split": "ranking", "cell_id": "A375",
             "pert_idose": "3.33 uM", "pert_itime": "24 h", "consensus": 0.5},
            {"pert_id": "BRD-X2", "context_id": "c5", "split": "ranking", "cell_id": "A375",
             "pert_idose": "10 uM", "pert_itime": "24 h", "consensus": 0.7},
        ]
    )
    exposure = pd.DataFrame(
        [
            {"pert_id": "BRD-X1", "level": "predicted", "measure": "predicted_mpo", "value": 0.0},
            {"pert_id": "BRD-X1", "level": "measured_preclinical", "measure": "kp", "value": 0.5},
            {"pert_id": "BRD-X2", "level": "predicted", "measure": "predicted_mpo", "value": 1.0},
        ]
    )
    targets = pd.DataFrame([{"pert_id": "BRD-X2"}])
    return ranking, context, exposure, targets


def test_parse_dose_um():
    assert parse_dose_um("10 uM") == pytest.approx(10.0)
    assert parse_dose_um("500 nM") == pytest.approx(0.5)
    assert parse_dose_um("0.04 uM") == pytest.approx(0.04)
    assert parse_dose_um("3.33 uM") == pytest.approx(3.33)
    assert parse_dose_um("unspecified") is None
    assert parse_dose_um(None) is None
    assert parse_dose_um("10") is None


def test_parse_time_h():
    assert parse_time_h("6 h") == pytest.approx(6.0)
    assert parse_time_h("24 h") == pytest.approx(24.0)
    assert parse_time_h(None) is None
    assert parse_time_h("unspecified") is None


def test_derive_gaps_ignores_held_out():
    ranking, context, exposure, targets = _frames()
    gaps = derive_gaps(ranking, context, exposure, targets, THETA)
    row = gaps[gaps["pert_id"] == "BRD-X1"].iloc[0]
    # SHSY5Y appears only in a held-out row: no brain cell from it.
    brain = {b["cell_id"]: b for b in json.loads(row["brain_cells_json"])}
    assert set(brain) == {"NEU"}
    assert brain["NEU"]["consensus"] == pytest.approx(-0.7)  # median of -0.9, -0.5
    assert brain["NEU"]["below_theta"]  # -0.7 <= theta (-0.6644)
    assert not row["cancer_lines_only"]
    assert list(row["doses_um"]) == pytest.approx([0.5, 10.0])
    assert list(row["times_h"]) == pytest.approx([6.0, 24.0])
    assert row["exposure_level"] == "predicted"
    assert row["exposure_label"] == "predicted low"
    assert row["measured_available"]  # flag only; value stays hidden
    assert not row["has_targets"]


def test_derive_gaps_cancer_only_and_penetrant():
    ranking, context, exposure, targets = _frames()
    gaps = derive_gaps(ranking, context, exposure, targets, THETA)
    row = gaps[gaps["pert_id"] == "BRD-X2"].iloc[0]
    assert json.loads(row["brain_cells_json"]) == []
    assert row["cancer_lines_only"]
    assert row["exposure_label"] == "predicted penetrant"
    assert not row["measured_available"]
    assert row["has_targets"]


def test_theta_matches_preregistration():
    assert load_theta() == pytest.approx(THETA)
    assert NEURAL_CELLS == {"SHSY5Y", "NEU", "NEU.KCL", "MNEU.E", "NPC", "NPC.CAS9", "NPC.TAK", "FIBRNPC"}
