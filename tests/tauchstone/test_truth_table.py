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
        assert {"held_out_cohort", "composition_adjusted", "lincs_context"} <= types
        assert not any(c.context_id == "GSE53697" for c in cand.hidden)  # QC-excluded
        assert any(c.context_id == "GSE173955" for c in cand.hidden)
        assert set(cand.truth) == {c.context_id for c in cand.hidden}
        assert all(isinstance(v, bool) for v in cand.truth.values())
    # Latent robustness induces variation across candidates (not all identical).
    rates = [np.mean(list(c.truth.values())) for c in w1]
    assert max(rates) > min(rates)
    # Brain exposure is untestable-without-data: present for some, absent for others.
    has_be = [any(c.type == "brain_exposure" for c in cand.hidden) for cand in w1]
    assert any(has_be) and not all(has_be)


def test_synthetic_world_calibration_claim_rate_and_contested_share():
    """Fixed-seed calibration: claim holds for 40-60%, >= 50% contested at step 0."""
    from pipelines.tauchstone.engine import EngineConfig, p_claim, verdict
    from pipelines.tauchstone.evaluation import full_information_verdict

    cfg = EngineConfig()
    world = tt.make_synthetic_world(n_candidates=100, seed=20261105)
    holds = sum(full_information_verdict(c.truth, cfg.q) == "SUPPORTED" for c in world)
    assert 0.4 <= holds / len(world) <= 0.6
    contested = 0
    for c in world:
        p = p_claim(c.hidden, list(c.ranking), len(c.hidden), cfg)
        if verdict(p, cfg) == "INSUFFICIENT_EVIDENCE":
            contested += 1
    assert contested / len(world) >= 0.5


def test_synthetic_world_exploitable_structure():
    """Block cells hold >= 3 hidden LINCS contexts with high mutual similarity."""
    from pipelines.tauchstone.engine import similarity

    world = tt.make_synthetic_world(n_candidates=10, seed=11)
    for cand in world:
        block = [c for c in cand.hidden if c.type == "lincs_context" and c.cell_id]
        by_cell: dict = {}
        for c in block:
            by_cell.setdefault(c.cell_id, []).append(c)
        biggest = max(by_cell.values(), key=len)
        assert len(biggest) >= 3  # a decisive block exists
        # Same cell -> similarity >= 0.4 + 0.3; revealing one informs the block.
        assert similarity(biggest[0], biggest[1]) >= 0.7
        # Cross-type pairs stay 0.1 per the spec (cohort vs adjusted informs nothing).
        by_id = {c.context_id: c for c in cand.hidden}
        assert similarity(by_id["GSE173955"], by_id["GSE132903__composition_adjusted"]) == 0.1


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
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt.cohort_qc(tmp_path, "GSE173955")


def _write_sig(tmp_path, cohort, fdr):
    sig = tmp_path / "signatures"
    sig.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"fdr": fdr}).to_parquet(sig / f"{cohort}__main.parquet")


def test_cohort_qc_gate(tmp_path):
    _write_sig(tmp_path, "GSE173955", [0.001] * 2182 + [0.5] * 100)
    _write_sig(tmp_path, "GSE53697", [0.9] * 50)
    assert tt.cohort_qc(tmp_path, "GSE173955") == (True, 2182)
    assert tt.cohort_qc(tmp_path, "GSE53697") == (False, 0)
    kept, gate = tt.gated_cohorts(tmp_path, ["GSE173955", "GSE53697"])
    assert kept == ["GSE173955"]
    assert gate == {"GSE173955": {"n_fdr05": 2182, "included": True},
                    "GSE53697": {"n_fdr05": 0, "included": False}}


def test_exposure_rows_untestable_excluded(tmp_path):
    ev = tmp_path / "evidence"
    ev.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(
        {
            "pert_id": ["E1", "E1", "E2", "E4", "E5", "E6"],
            "measure": ["kp", "pampa_pe", "kp", "csf", "pampa_pe", "kp"],
            "value": [0.5, 1e-7, 0.01, 1.0, 5e-6, 0.9],
            "is_measured": [True, True, True, True, True, False],
        }
    ).to_parquet(ev / "exposure.parquet")
    rows = tt._exposure_rows(["E1", "E2", "E3", "E4", "E5", "E6"], tmp_path)
    by_cid = {r["candidate_id"]: r["outcome"] for r in rows}
    assert by_cid == {"E1": "survive", "E2": "fail", "E4": "survive", "E5": "survive"}
    # E3 (no measured rows) and E6 (predicted only) are untestable: not in S_d.
