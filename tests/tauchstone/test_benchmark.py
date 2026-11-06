"""Benchmark tests: per-run metrics on a hand-checkable world + replay smoke."""

import pandas as pd
import pytest

from pipelines.tauchstone.engine import BASELINES, CO_PRIMARY, POLICIES, EngineConfig
from pipelines.tauchstone.evaluation import (
    contested_candidates,
    full_information_verdict,
    per_run_frame,
    select_lambda,
    summarize,
)
from pipelines.tauchstone.replay import RUN_COLUMNS, build_summary, run_replay
from pipelines.tauchstone.truth_table import make_synthetic_world


def _hand_runs():
    # Candidate A: all survive -> full SUPPORTED. B: 1/4 survive -> full FRAGILE (q=0.7).
    # Five steps per run (benchmark budget); verdicts chosen to hand-check t_correct.
    rows = []
    seq_a0 = ["INSUFFICIENT_EVIDENCE", "SUPPORTED_SO_FAR", "SUPPORTED_SO_FAR",
              "SUPPORTED_SO_FAR", "SUPPORTED_SO_FAR"]
    seq_b0 = ["FRAGILE_CONTEXT_DEPENDENT"] * 5
    seq_a1 = ["INSUFFICIENT_EVIDENCE"] * 5  # censored: never matches within budget
    for cid, seed, seq, outs, step0 in [
        ("A", 0, seq_a0, ["survive"] * 5, "INSUFFICIENT_EVIDENCE"),
        ("B", 0, seq_b0, ["fail"] * 5, "INSUFFICIENT_EVIDENCE"),
        ("A", 1, seq_a1, ["survive"] * 5, "INSUFFICIENT_EVIDENCE"),
        # C: all survive, decisive at step 0 -> t_correct 0.
        ("C", 0, ["SUPPORTED_SO_FAR"] * 5, ["survive"] * 5, "SUPPORTED_SO_FAR"),
    ]:
        rows.append(
            {"policy": "max_failure", "candidate_id": cid, "seed": seed, "step": 0,
             "context_id": None, "p_survive_before": float("nan"), "outcome": None,
             "p_claim_before": 0.5, "p_claim_after": 0.5, "verdict": step0}
        )
        for step, (v, o) in enumerate(zip(seq, outs, strict=True), start=1):
            rows.append(
                {"policy": "max_failure", "candidate_id": cid, "seed": seed, "step": step,
                 "context_id": f"c{step}", "p_survive_before": 0.6, "outcome": o,
                 "p_claim_before": 0.5, "p_claim_after": 0.6, "verdict": v}
            )
    return pd.DataFrame(rows, columns=RUN_COLUMNS)


def test_full_information_verdict():
    assert full_information_verdict({"a": True, "b": True, "c": True, "d": False}, 0.7) == "SUPPORTED"
    assert full_information_verdict({"a": True, "b": False, "c": False}, 0.7) == "FRAGILE"


def test_per_run_frame_hand_checkable():
    truth = {
        "A": {"c1": True, "c2": True, "c3": True, "c4": True},
        "B": {"c1": True, "c2": False, "c3": False, "c4": False},
        "C": {"c1": True, "c2": True, "c3": True, "c4": True},
    }
    per = per_run_frame(_hand_runs(), truth, 0.7, budget=5)
    a0 = per[(per.candidate_id == "A") & (per.seed == 0)].iloc[0]
    assert a0["full"] == "SUPPORTED" and a0["t_correct"] == 2 and a0["correct_at_5"]
    assert a0["verdict_at_3"] == "SUPPORTED_SO_FAR" and a0["verdict_at_5"] == "SUPPORTED_SO_FAR"
    assert a0["correct_at_budget"]
    b0 = per[(per.candidate_id == "B")].iloc[0]
    assert b0["full"] == "FRAGILE" and b0["t_correct"] == 1
    a1 = per[(per.candidate_id == "A") & (per.seed == 1)].iloc[0]
    assert a1["t_correct"] == 6  # budget + 1, censored
    assert not a1["correct_at_5"]
    c0 = per[(per.candidate_id == "C")].iloc[0]
    assert c0["full"] == "SUPPORTED" and c0["t_correct"] == 0  # decisive at step 0


def test_replay_smoke_and_determinism():
    world = make_synthetic_world(n_candidates=4, seed=5)
    cfg = EngineConfig()
    r1 = run_replay(world, seeds=[20261105, 20261106], budget=2, cfg=cfg)
    r2 = run_replay(world, seeds=[20261105, 20261106], budget=2, cfg=cfg)
    pd.testing.assert_frame_equal(r1, r2)
    assert list(r1.columns) == RUN_COLUMNS
    assert set(r1["policy"].unique()) == set(POLICIES)
    assert (r1["step"] <= 2).all()
    assert (r1["step"] == 0).any()  # step-0 belief rows recorded
    assert set(r1[r1["step"] == 0]["verdict"].unique()) <= {
        "SUPPORTED_SO_FAR", "FRAGILE_CONTEXT_DEPENDENT", "INSUFFICIENT_EVIDENCE"}
    with pytest.raises(ValueError):
        run_replay(world, policies=["oracle-nope"], seeds=[20261105], budget=1, cfg=cfg)


def _check_block(block):
    assert {p["policy"] for p in block["policies"]} == set(POLICIES)
    for p in block["policies"]:
        assert set(p["experiments_to_correct_verdict"]) == {"median", "iqr", "ci95"}
        assert set(p["fragile_recall_at_3"]) == {"estimate", "ci95"}
        assert set(p["decision_accuracy"]) == {"estimate", "ci95"}
        assert p["brier"] is None or 0.0 <= p["brier"] <= 1.0
    assert len(block["calibration"]) == 10
    assert set(block["calibration"][0]) == {"bin_lo", "bin_hi", "mean_predicted", "observed_rate", "n"}
    holm = [t for t in block["tests"] if t["metric"] == "experiments_to_correct_verdict"]
    assert len(holm) == 10  # each co-primary vs each of the 5 baselines
    for t in holm:
        assert t["policy_a"] in CO_PRIMARY and t["policy_b"] in BASELINES
        assert 0.0 <= t["p_holm"] <= 1.0
    desc = [t for t in block["tests"] if "descriptive" in t["metric"]]
    assert len(desc) == 1  # co-primary head-to-head, uncorrected p, labelled descriptive
    assert {desc[0]["policy_a"], desc[0]["policy_b"]} == set(CO_PRIMARY)


def test_summarize_two_blocks_and_contested_share():
    world = make_synthetic_world(n_candidates=12, seed=9)
    cfg = EngineConfig()
    runs = run_replay(world, seeds=[20261105, 20261106], budget=3, cfg=cfg)
    truth = {c.candidate_id: c.truth for c in world}
    result = summarize(runs, truth, cfg, budget=3, reps=50)
    assert set(result) == {"contested", "all", "contested_share"}
    _check_block(result["contested"])
    _check_block(result["all"])
    assert 0.0 <= result["contested_share"] <= 1.0
    assert result["contested"]["n_candidates"] <= result["all"]["n_candidates"] == 12
    # Wilcoxon+Holm run on the contested set: 10 co-primary-vs-baseline + 1 descriptive H2H.
    assert len(result["contested"]["tests"]) == 11


def test_oracle_never_in_summary_policies():
    world = make_synthetic_world(n_candidates=6, seed=9)
    cfg = EngineConfig()
    runs = run_replay(world, policies=[*POLICIES, "oracle"], seeds=[20261105], budget=2, cfg=cfg)
    truth = {c.candidate_id: c.truth for c in world}
    result = summarize(runs, truth, cfg, budget=2, reps=20)
    for block in (result["contested"], result["all"]):
        assert "oracle" not in {p["policy"] for p in block["policies"]}
    summary = build_summary(runs, truth, cfg, 2, "sha", "commit", synthetic=True, reps=20)
    assert "oracle" not in {p["policy"] for p in summary["policies"]}
    assert "oracle" not in {p["policy"] for p in summary["all_candidates"]["policies"]}
    assert 0.0 <= summary["contested_share"] <= 1.0
    assert summary["all_candidates"]["contested_share"] == summary["contested_share"]


def test_harness_oracle_beats_random_hybrid_not_worse():
    """Fixed-seed harness gate: exploitable structure lets smart policies win.

    oracle beats random on contested decision accuracy at budget 3, and the
    hybrid's contested mean experiments-to-correct is no worse than random's
    (tie allowed). A hybrid loss here means the acquisition is wrong, not the
    world (checked: hybrid 2.62 < random 2.90 in the prototype).
    """
    world = make_synthetic_world(n_candidates=30, seed=20261105)
    cfg = EngineConfig()
    seeds = [20261105 + i for i in range(5)]
    runs = run_replay(world, policies=["random", "tauchstone_hybrid", "oracle"], seeds=seeds, budget=3, cfg=cfg)
    truth = {c.candidate_id: c.truth for c in world}
    cont = contested_candidates(runs)
    assert len(cont) / len(world) >= 0.5
    per = per_run_frame(runs, truth, cfg.q, budget=3)
    sub = per[per["candidate_id"].isin(cont)]
    acc = sub.groupby("policy")["correct_at_budget"].mean()
    assert acc["oracle"] > acc["random"]
    mean_t = sub.groupby("policy")["t_correct"].mean()
    assert mean_t["tauchstone_hybrid"] <= mean_t["random"]


def test_select_lambda_returns_grid_value():
    dev = make_synthetic_world(n_candidates=4, seed=13)
    best, table = select_lambda(dev, grid=(0.0, 1.0), seeds=[20261105, 20261106], budget=2)
    assert best in (0.0, 1.0)
    assert [r["lambda"] for r in table] == [0.0, 1.0]


def test_verdict_carried_forward_when_run_ends_before_budget():
    """A candidate with 2 hidden contexts finishes at step 2; its verdict at 3 and 5 is the step-2 verdict."""
    import pandas as pd

    from pipelines.tauchstone.evaluation import per_run_frame

    runs = pd.DataFrame({
        "policy": ["random"] * 3, "candidate_id": ["C"] * 3, "seed": [1] * 3, "step": [0, 1, 2],
        "verdict": ["INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", "SUPPORTED_SO_FAR"],
    })
    per = per_run_frame(runs, {"C": {"a": True, "b": True}}, q=0.7, budget=5)
    row = per.iloc[0]
    assert row["verdict_at_3"] == "SUPPORTED_SO_FAR"
    assert row["verdict_at_5"] == "SUPPORTED_SO_FAR"
    assert bool(row["correct_at_5"]) and bool(row["correct_at_budget"])
