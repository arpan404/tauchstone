"""Benchmark tests: per-run metrics on a hand-checkable world + replay smoke."""

import pandas as pd

from pipelines.tauchstone.engine import POLICIES, EngineConfig
from pipelines.tauchstone.evaluation import (
    full_information_verdict,
    per_run_frame,
    select_lambda,
    summarize,
)
from pipelines.tauchstone.replay import RUN_COLUMNS, run_replay
from pipelines.tauchstone.truth_table import make_synthetic_world


def _hand_runs():
    # Candidate A: all survive -> full SUPPORTED. B: 1/4 survive -> full FRAGILE (q=0.7).
    # Five steps per run (benchmark budget); verdicts chosen to hand-check t_correct.
    rows = []
    seq_a0 = ["INSUFFICIENT_EVIDENCE", "SUPPORTED_SO_FAR", "SUPPORTED_SO_FAR",
              "SUPPORTED_SO_FAR", "SUPPORTED_SO_FAR"]
    seq_b0 = ["FRAGILE_CONTEXT_DEPENDENT"] * 5
    seq_a1 = ["INSUFFICIENT_EVIDENCE"] * 5  # censored: never matches within budget
    for cid, seed, seq, outs in [
        ("A", 0, seq_a0, ["survive"] * 5),
        ("B", 0, seq_b0, ["fail"] * 5),
        ("A", 1, seq_a1, ["survive"] * 5),
    ]:
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
    }
    per = per_run_frame(_hand_runs(), truth, 0.7, budget=5)
    a0 = per[(per.candidate_id == "A") & (per.seed == 0)].iloc[0]
    assert a0["full"] == "SUPPORTED" and a0["t_correct"] == 2 and a0["correct_at_5"]
    assert a0["verdict_at_3"] == "SUPPORTED_SO_FAR" and a0["verdict_at_5"] == "SUPPORTED_SO_FAR"
    b0 = per[(per.candidate_id == "B")].iloc[0]
    assert b0["full"] == "FRAGILE" and b0["t_correct"] == 1
    a1 = per[(per.candidate_id == "A") & (per.seed == 1)].iloc[0]
    assert a1["t_correct"] == 6  # budget + 1, censored
    assert not a1["correct_at_5"]


def test_replay_smoke_and_determinism():
    world = make_synthetic_world(n_candidates=4, seed=5)
    cfg = EngineConfig()
    r1 = run_replay(world, seeds=[20261105, 20261106], budget=2, cfg=cfg)
    r2 = run_replay(world, seeds=[20261105, 20261106], budget=2, cfg=cfg)
    pd.testing.assert_frame_equal(r1, r2)
    assert list(r1.columns) == RUN_COLUMNS
    assert set(r1["policy"].unique()) == set(POLICIES)
    assert (r1["step"] <= 2).all()


def test_summarize_smoke_schema_keys():
    world = make_synthetic_world(n_candidates=6, seed=9)
    cfg = EngineConfig()
    runs = run_replay(world, seeds=[20261105, 20261106], budget=3, cfg=cfg)
    truth = {c.candidate_id: c.truth for c in world}
    policies, calibration, tests = summarize(runs, truth, cfg, budget=3, reps=50)
    assert {p["policy"] for p in policies} == set(POLICIES)
    for p in policies:
        assert set(p["experiments_to_correct_verdict"]) == {"median", "iqr", "ci95"}
        assert set(p["fragile_recall_at_3"]) == {"estimate", "ci95"}
        assert set(p["decision_accuracy"]) == {"estimate", "ci95"}
        assert p["brier"] is None or 0.0 <= p["brier"] <= 1.0
    assert len(calibration) == 10
    assert set(calibration[0]) == {"bin_lo", "bin_hi", "mean_predicted", "observed_rate", "n"}
    assert len(tests) == 5  # hybrid vs each other policy
    for t in tests:
        assert t["policy_a"] == "tauchstone_hybrid"
        assert 0.0 <= t["p_holm"] <= 1.0


def test_select_lambda_returns_grid_value():
    dev = make_synthetic_world(n_candidates=4, seed=13)
    best, table = select_lambda(dev, grid=(0.0, 1.0), seeds=[20261105, 20261106], budget=2)
    assert best in (0.0, 1.0)
    assert [r["lambda"] for r in table] == [0.0, 1.0]
