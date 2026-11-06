"""Truth-table builder tests: synthetic world, row builders, prereg guard."""

import json
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


def test_top5_rule_ranked_cutoff_and_unrankable():
    df = pd.DataFrame(
        {
            "pert_id": [f"P{i}" for i in range(20)],
            "rank": range(1, 21),
            "consensus_median": np.arange(20, dtype=float),
            "n_ranking_contexts": [3] * 20,
        }
    )
    res = tt.top5_rule(df, ["P0", "P1", "P19", "PX", "P5"])
    assert res["P0"]["survive"] is True  # rank 1 <= ceil(5% of 20)=1
    assert res["P1"]["survive"] is False
    assert res["PX"] == {"ranked": False, "rank": None, "cutoff": 1, "n_ranked": 20,
                         "survive": False, "detail": "not rankable"}
    df2 = df.copy()
    df2.loc[df2["pert_id"] == "P0", "n_ranking_contexts"] = 2
    res2 = tt.top5_rule(df2, ["P0"])
    assert res2["P0"]["survive"] is False  # too few ranking contexts -> fail
    assert res2["P0"]["detail"] == "not rankable"


def test_lincs_rows_capped_stratified_and_parsed():
    combos = [(d, t) for d in ("10 uM", "1 uM") for t in ("24 h", "6 h")]
    ctx_ids, cons = [], []
    for cell in ("MCF7", "A549", "VCAP"):
        for d, t in combos:
            ctx_ids.append(f"{cell}|{d}|{t}")
            cons.append(-1.0 if cell == "MCF7" else 0.0)
    held = pd.DataFrame({"context_id": ctx_ids, "consensus": cons})
    rows = tt._lincs_rows({"C1": held}, theta=-0.5, seed=0)
    assert len(rows) == 8  # capped at 8, from 12 unique contexts
    cells = [r["cell_id"] for r in rows]
    assert cells.count("MCF7") == 3 and cells.count("A549") == 3 and cells.count("VCAP") == 2
    assert {r["outcome"] for r in rows} == {"survive", "fail"}
    r0 = next(r for r in rows if r["cell_id"] == "MCF7")
    assert r0["pert_idose"] in ("10 uM", "1 uM") and r0["pert_itime"] in ("24 h", "6 h")
    assert r0["rule"].startswith("Survives if this held-out LINCS")
    assert tt._parse_lincs_context("X|Y") == ("X", "Y", None)


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
        tt._exposure_rows(["C1"], tmp_path)
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt.cohort_gate(tmp_path)
    with pytest.raises(FileNotFoundError, match="missing upstream input"):
        tt.load_theta(tmp_path, permctl="NOPE")


def _write_sig(base_dir, filename, stats):
    sig = base_dir / "signatures"
    sig.mkdir(parents=True, exist_ok=True)
    n = len(stats)
    pd.DataFrame(
        {
            "entrez_id": [str(i) for i in range(n)],
            "symbol": [f"G{i}" for i in range(n)],
            "log2fc": np.zeros(n),
            "stat": list(stats),
            "p_value": np.full(n, 0.5),
            "fdr": np.full(n, 0.5),
            "mean_expr": np.zeros(n),
            "method": ["limma"] * n,
        }
    ).to_parquet(sig / filename)


def test_cohort_gate_correlation(tmp_path):
    base = np.linspace(-3, 3, 60)
    _write_sig(tmp_path, "GSE132903__main.parquet", base)
    _write_sig(tmp_path, "GOOD__main.parquet", base + np.random.default_rng(0).normal(0, 0.1, 60))
    _write_sig(tmp_path, "BAD__main.parquet", -base)
    gate = tt.cohort_gate(tmp_path, ranking="GSE132903__main", cohorts=["GOOD", "BAD"], min_rho=0.2)
    assert gate["GOOD"]["included"] is True and gate["GOOD"]["rho"] > 0.9
    assert gate["BAD"]["included"] is False and gate["BAD"]["rho"] < -0.9
    assert gate["GOOD"]["n_shared"] == 60


def _write_fixture_processed(tmp_path, theta=-1.5, summary_theta=-1.5, exposure=False):
    """Tiny real-shaped processed dir: pool C1/C3 benchmark + C2 development."""
    p = tmp_path / "processed"
    (p / "scores").mkdir(parents=True)
    (p / "signatures").mkdir(parents=True)
    pd.DataFrame(
        {"pert_id": ["C1", "C3", "C2"], "pool": ["benchmark", "benchmark", "development"],
         "pool_rank": [1, 2, 51]}
    ).to_parquet(p / "scores" / "R__candidate_pool.parquet")
    stats = np.linspace(-3, 3, 60)
    _write_sig(p, "R.parquet", stats)
    _write_sig(p, "COH1__main.parquet", stats)  # rho 1.0 -> passes
    _write_sig(p, "COH2__main.parquet", -stats)  # rho -1.0 -> fails
    pd.DataFrame(
        {
            "pert_id": ["C1"] * 4 + ["C2"] * 2,
            "context_id": ["MCF7|10 uM|24 h", "A549|1 uM|6 h", "MCF7|1 uM|6 h", "A549|10 uM|24 h",
                           "MCF7|10 uM|24 h", "MCF7|10 uM|24 h"],
            "split": ["ranking"] * 3 + ["held_out"] + ["ranking", "held_out"],
            "cell_id": ["MCF7", "A549", "MCF7", "A549", "MCF7", "MCF7"],
            "pert_idose": ["10 uM", "1 uM", "1 uM", "10 uM", "10 uM", "10 uM"],
            "pert_itime": ["24 h", "6 h", "6 h", "24 h", "24 h", "24 h"],
            "consensus": [-2.0, -2.0, -2.0, -2.0, -0.1, -0.1],
            "z_wtcs": [0.0] * 6, "z_ks": [0.0] * 6, "z_cosine": [0.0] * 6,
        }
    ).to_parquet(p / "scores" / "R__context_scores.parquet")
    (p / "scores" / "PCTL__permutation_null.parquet.provenance.json").write_text(
        json.dumps({"parameters": {"theta": theta}})
    )
    (p / "scores" / "PCTL__permutation_summary.parquet.provenance.json").write_text(
        json.dumps({"parameters": {"theta": summary_theta}})
    )
    coh1 = pd.DataFrame(
        {"pert_id": [f"X{i}" for i in range(20)], "rank": range(1, 21),
         "consensus_median": np.arange(20, dtype=float), "n_ranking_contexts": [3] * 20,
         "pert_iname": ["x"] * 20, "consensus_q25": 0.0, "consensus_q75": 0.0,
         "consensus_iqr": 0.0, "z_wtcs_median": 0.0, "z_ks_median": 0.0, "z_cosine_median": 0.0}
    )
    coh1.loc[0, ["pert_id"]] = "C1"  # rank 1 -> top 5% of 20 -> survive
    coh1.loc[4, ["pert_id"]] = "C2"  # rank 5 -> fail (C3 absent -> not rankable)
    coh1.to_parquet(p / "scores" / "COH1__main__compound_ranking.parquet")
    adj = coh1.copy()
    adj.loc[0, ["pert_id"]] = "C2"  # C2 rank 1 -> survive in adjusted
    adj.loc[4, ["pert_id"]] = "C1"  # C1 rank 5 -> fail in adjusted
    adj.to_parquet(p / "scores" / "GSE132903__composition_adjusted__compound_ranking.parquet")
    if exposure:
        (p / "evidence").mkdir(parents=True, exist_ok=True)
        pd.DataFrame({"pert_id": ["C1"], "measure": ["kp"], "value": [0.5],
                      "is_measured": [True]}).to_parquet(p / "evidence" / "exposure.parquet")
    return p


def test_load_theta_sidecars(tmp_path):
    p = _write_fixture_processed(tmp_path)
    assert tt.load_theta(p, permctl="PCTL") == -1.5
    (p / "scores" / "PCTL__permutation_summary.parquet.provenance.json").write_text(
        json.dumps({"parameters": {"theta": -1.0}})
    )
    with pytest.raises(ValueError, match="theta mismatch"):
        tt.load_theta(p, permctl="PCTL")


def test_build_truth_table_real_files(tmp_path, monkeypatch):
    p = _write_fixture_processed(tmp_path)
    monkeypatch.setattr(tt, "HELD_OUT_COHORTS", ["COH1", "COH2"])
    monkeypatch.setitem(tt.COHORT_META, "COH1", ("RNA-seq", "hippocampus"))
    df, params = tt.build_truth_table(p, ranking="R", permctl="PCTL", seed=0)
    assert list(df.columns) == tt.TRUTH_TABLE_COLUMNS
    # Gate: COH1 passes, COH2 excluded (no COH2 rows anywhere).
    assert params["cohort_qc_gate"]["COH1"]["included"] is True
    assert params["cohort_qc_gate"]["COH2"]["included"] is False
    assert (df["context_id"] != "COH2").all()
    # Top-5%: C1 survives COH1 (rank 1/20), C2 fails (rank 5), C3 unrankable fails with note.
    coh = df[df["context_type"] == "held_out_cohort"]
    by_cid = {r["candidate_id"]: (r["outcome"], r["rule"]) for _, r in coh.iterrows()}
    assert by_cid["C1"][0] == "survive" and by_cid["C2"][0] == "fail"
    assert by_cid["C3"][0] == "fail" and "not rankable" in by_cid["C3"][1]
    adj = df[df["context_type"] == "composition_adjusted"]
    assert {r["candidate_id"]: r["outcome"] for _, r in adj.iterrows()} == {
        "C1": "fail", "C3": "fail", "C2": "survive"}
    # LINCS: parsed metadata, theta threshold, C3 (no held-out) absent.
    lin = df[df["context_type"] == "lincs_context"]
    assert set(lin["candidate_id"].unique()) <= {"C1", "C2"}
    assert (lin["threshold"] == -1.5).all() and lin["cell_id"].notna().all()
    c1_surv = lin[(lin["candidate_id"] == "C1") & (lin["outcome"] == "survive")]
    assert len(c1_surv) == 1  # only the -2.0 held-out consensus survives
    # No exposure file -> no exposure rows, flag false, re-runnable.
    assert "brain_exposure" not in set(df["context_type"])
    assert params["exposure_included"] is False
    p2 = _write_fixture_processed(tmp_path / "p2", exposure=True)
    monkeypatch.setattr(tt, "HELD_OUT_COHORTS", ["COH1", "COH2"])
    df2, params2 = tt.build_truth_table(p2, ranking="R", permctl="PCTL", seed=0)
    be = df2[df2["context_type"] == "brain_exposure"]
    assert params2["exposure_included"] is True
    assert {r["candidate_id"]: r["outcome"] for _, r in be.iterrows()} == {"C1": "survive"}
    assert "Survives on measured CNS evidence" in be.iloc[0]["rule"]


def test_integrity_helper():
    from pipelines.tauchstone.calibrate import pool_type_counts, require_development_only

    truth = pd.DataFrame(
        {"candidate_id": ["B1", "D1"], "context_type": ["lincs_context"] * 2,
         "outcome": ["survive", "fail"]})
    pool = pd.DataFrame({"pert_id": ["B1", "D1"], "pool": ["benchmark", "development"]})
    # Counts are safe for both pools (no outcomes touched).
    assert pool_type_counts(truth, pool) == {
        "benchmark": {"lincs_context": 1}, "development": {"lincs_context": 1}}
    merged = truth.merge(pool, left_on="candidate_id", right_on="pert_id")
    with pytest.raises(ValueError, match="refusing.*benchmark-pool"):
        require_development_only(merged, context="test")
    dev = require_development_only(merged[merged["pool"] == "development"], context="test")
    assert len(dev) == 1


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
