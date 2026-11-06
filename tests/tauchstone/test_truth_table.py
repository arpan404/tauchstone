"""Truth-table builder tests: synthetic world, row builders, prereg guard."""

import subprocess

import numpy as np
import pandas as pd
import pytest

import pipelines.tauchstone.truth_table as tt


def test_make_synthetic_world_reproducible_and_correlated():
    w1 = tt.make_synthetic_world(n_candidates=20, seed=1)
    w2 = tt.make_synthetic_world(n_candidates=20, seed=1)
    assert [c.truth for c in w1] == [c.truth for c in w2]
    w3 = tt.make_synthetic_world(n_candidates=20, seed=2)
    assert [c.truth for c in w1] != [c.truth for c in w3]
    for cand in w1:
        assert cand.ranking  # ranking observations exist
        types = {c.type for c in cand.hidden}
        assert {"held_out_cohort", "composition_adjusted", "lincs_context", "brain_exposure"} <= types
        assert set(cand.truth) == {c.context_id for c in cand.hidden}
        assert all(isinstance(v, bool) for v in cand.truth.values())
    # Latent robustness induces variation across candidates (not all identical).
    rates = [np.mean(list(c.truth.values())) for c in w1]
    assert max(rates) > min(rates)


def test_synthetic_truth_table_schema_and_labels():
    world = tt.make_synthetic_world(n_candidates=5, seed=3)
    df = tt.synthetic_truth_table(world)
    assert list(df.columns) == tt.TRUTH_TABLE_COLUMNS
    assert set(df["outcome"].unique()) <= {"survive", "fail"}
    assert df["label"].str.endswith("[synthetic]").all()
    assert df["candidate_id"].nunique() == 5


def test_top5_percent_ids():
    df = pd.DataFrame(
        {"pert_id": [f"P{i}" for i in range(20)], "consensus_median": np.arange(20, dtype=float)}
    )
    assert tt.top5_percent_ids(df) == {"P0"}  # ceil(5% of 20) = 1, most negative first
    assert tt.top5_percent_ids(df.iloc[:0]) == set()


def test_lincs_rows_capped_and_stratified():
    split = pd.DataFrame(
        {
            "pert_id": ["C1"] * 10,
            "context_id": [f"MCF7|10 uM|24 h::{i}" for i in range(5)]
            + [f"A549|1 uM|6 h::{i}" for i in range(5)],
            "split": ["held_out"] * 10,
        }
    )
    scores = pd.DataFrame(
        {
            "pert_id": ["C1"] * 10,
            "context_id": split["context_id"],
            "consensus": [-1.0] * 10,
            "cell_id": ["MCF7"] * 5 + ["A549"] * 5,
            "pert_idose": ["10 uM"] * 5 + ["1 uM"] * 5,
            "pert_itime": ["24 h"] * 5 + ["6 h"] * 5,
        }
    )
    rows = tt._lincs_rows(["C1"], split, scores, theta=-0.5, seed=0)
    assert len(rows) == 8  # capped at 8
    cells = [r["cell_id"] for r in rows]
    assert cells.count("MCF7") == 4 and cells.count("A549") == 4  # stratified round-robin
    assert all(r["outcome"] == "survive" for r in rows)


def test_require_and_load_theta_name_missing_files(tmp_path):
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt.require(tmp_path / "nope.parquet")
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt.load_theta(tmp_path)


def _git_repo_with_prereg(tmp_path, status):
    repo = tmp_path / "repo"
    man = repo / "data" / "manifests"
    man.mkdir(parents=True)
    (man / "preregistration.yaml").write_text(f"status: {status}\n")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "prereg"], cwd=repo, check=True)
    return repo


def test_guard_refuses_draft_and_passes_frozen(tmp_path, monkeypatch):
    repo = _git_repo_with_prereg(tmp_path, "draft")
    monkeypatch.setattr(tt, "MANIFESTS", repo / "data" / "manifests")
    with pytest.raises(SystemExit, match="refusing"):
        tt.prereg_guard()

    repo2 = _git_repo_with_prereg(tmp_path / "r2", "frozen")
    monkeypatch.setattr(tt, "MANIFESTS", repo2 / "data" / "manifests")
    sha, commit = tt.prereg_guard()
    assert len(sha) == 64 and len(commit) == 40

    # Uncommitted change after freezing -> refuse.
    (repo2 / "data" / "manifests" / "preregistration.yaml").write_text("status: frozen # edited\n")
    with pytest.raises(SystemExit, match="refusing"):
        tt.prereg_guard()


def test_cohort_and_exposure_rows_missing_inputs_raise(tmp_path):
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt._cohort_rows(["C1"], "GSE173955", "held_out_cohort", "lbl", tmp_path)
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt._exposure_rows(["C1"], tmp_path)
