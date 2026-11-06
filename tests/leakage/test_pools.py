"""Check 3 — benchmark and development pools are disjoint and prereg-faithful.

The benchmark pool (eligible ranks 1-50) and development pool (51-100) must not
overlap; the type priors and lambda in the frozen preregistration must equal
the development-only survive rates (recomputed from the truth table); demo
candidates must be exactly pool ranks 1, 5 and 12.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest
import yaml

from tests.leakage._paths import POOL, PROCESSED, TRUTH, needs_data, require

REPO = Path(__file__).resolve().parents[2]


@needs_data
def test_pools_disjoint_and_demo_ranks() -> None:
    require(POOL)
    con = duckdb.connect()
    try:
        pool = con.execute(
            "SELECT pool_rank, pert_id, pool, is_demo FROM read_parquet(?)", [str(PROCESSED / POOL)]
        ).fetchdf()
    finally:
        con.close()
    bench = set(pool.loc[pool["pool"] == "benchmark", "pert_id"])
    dev = set(pool.loc[pool["pool"] == "development", "pert_id"])
    assert len(bench) == 50 and len(dev) == 50
    assert not (bench & dev), "benchmark and development pools overlap"
    assert set(pool.loc[pool["pool"] == "benchmark", "pool_rank"]) == set(range(1, 51))
    assert set(pool.loc[pool["pool"] == "development", "pool_rank"]) == set(range(51, 101))
    demo = set(pool.loc[pool["is_demo"], "pool_rank"])
    assert demo == {1, 5, 12}, f"demo candidates must be pool ranks 1, 5, 12, got {sorted(demo)}"


@needs_data
def test_type_priors_equal_development_survive_rates() -> None:
    require(POOL, TRUTH)
    prereg = yaml.safe_load((REPO / "data" / "manifests" / "preregistration.yaml").read_text())
    priors = prereg["tauchstone_engine"]["type_priors"]
    assert prereg["tauchstone_engine"]["lambda"] == 0.5
    assert prereg["tauchstone_engine"]["lambda_lookahead"] == 0.0
    con = duckdb.connect()
    try:
        pool = con.execute(
            "SELECT pert_id, pool FROM read_parquet(?)", [str(PROCESSED / POOL)]
        ).fetchdf()
        truth = con.execute(
            "SELECT candidate_id, context_type, outcome FROM read_parquet(?)",
            [str(PROCESSED / TRUTH)],
        ).fetchdf()
    finally:
        con.close()
    dev_ids = set(pool.loc[pool["pool"] == "development", "pert_id"])
    bench_ids = set(pool.loc[pool["pool"] == "benchmark", "pert_id"])
    # No truth-table row may reference a compound outside the two pools.
    assert set(truth["candidate_id"]) == bench_ids | dev_ids
    assert set(truth.loc[truth["candidate_id"].isin(bench_ids), "candidate_id"]) == bench_ids
    dev = truth[truth["candidate_id"].isin(dev_ids)]
    rates = {}
    for ctype, sub in dev.groupby("context_type"):
        rates[ctype] = float((sub["outcome"] == "survive").mean())
    assert rates["held_out_cohort"] == pytest.approx(priors["held_out_cohort"], abs=1e-4)
    assert rates["composition_adjusted"] == pytest.approx(priors["composition_adjusted"], abs=1e-4)
    assert rates["lincs_context"] == pytest.approx(priors["lincs_context"], abs=1e-4)
    assert rates["brain_exposure"] == pytest.approx(priors["brain_exposure"], abs=1e-4)
    # Development pool has exactly one row per candidate for cohort-type contexts.
    assert (dev[dev["context_type"] == "held_out_cohort"].groupby("candidate_id").size() == 1).all()
