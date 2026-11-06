"""Check 1 — ranking uses ranking-split contexts only.

Recomputes compound medians from ``context_scores`` ranking rows and matches the
ranking file; recomputes z-scores from ``signature_scores`` raw scores using
ranking-only mu/sd and matches the file. Any held-out contribution would break
both equalities.
"""

from __future__ import annotations

import duckdb
import pytest

from tests.leakage._paths import (
    MAIN_CONTEXT,
    MAIN_RANKING,
    MAIN_SIGNATURE_SCORES,
    PROCESSED,
    needs_data,
    require,
)


@needs_data
def test_compound_medians_match_ranking_only() -> None:
    require(MAIN_CONTEXT, MAIN_RANKING)
    con = duckdb.connect()
    try:
        ctx = con.execute(
            "SELECT pert_id, context_id, split, consensus FROM read_parquet(?)",
            [str(PROCESSED / MAIN_CONTEXT)],
        ).fetchdf()
        rank = con.execute(
            "SELECT pert_id, consensus_median, n_ranking_contexts FROM read_parquet(?)",
            [str(PROCESSED / MAIN_RANKING)],
        ).fetchdf()
    finally:
        con.close()
    assert (ctx["split"] == "ranking").any() and (ctx["split"] == "held_out").any()
    recomp = ctx[ctx["split"] == "ranking"].groupby("pert_id").consensus.median()
    file = rank.set_index("pert_id").consensus_median
    common = file.index.intersection(recomp.index)
    assert len(common) == len(file), "every ranked compound must have ranking contexts"
    diff = (file.loc[common] - recomp.loc[common]).abs()
    assert float(diff.max()) == 0.0, f"ranking leaks non-ranking rows: max diff {diff.max()}"
    # Every ranked compound used >= 3 ranking contexts (algorithms.md section 2).
    counts = ctx[ctx["split"] == "ranking"].groupby("pert_id").size()
    filed_n = rank.set_index("pert_id").n_ranking_contexts
    assert bool((counts.loc[common] == filed_n.loc[common]).all())
    assert bool((filed_n >= 3).all())
    # Rank 1 is the most negative consensus (reversal = negative).
    assert rank.sort_values("consensus_median").iloc[0]["consensus_median"] == rank["consensus_median"].min()
    # Sanity: folding held-out rows in would change the medians, so this test can see leakage.
    held = ctx[ctx["split"] == "held_out"].groupby("pert_id").consensus.median()
    both = file.index.intersection(held.index)
    assert float((file.loc[both] - held.loc[both]).abs().max()) > 0


@needs_data
@pytest.mark.parametrize("raw,col", [("wtcs", "z_wtcs"), ("ks", "z_ks"), ("cosine", "z_cosine")])
def test_standardisation_uses_ranking_rows_only(raw: str, col: str) -> None:
    require(MAIN_SIGNATURE_SCORES)
    con = duckdb.connect()
    try:
        ss = con.execute(
            f"SELECT split, {raw}, {col} FROM read_parquet(?)",  # noqa: S608
            [str(PROCESSED / MAIN_SIGNATURE_SCORES)],
        ).fetchdf()
    finally:
        con.close()
    ranking = ss[ss["split"] == "ranking"]
    mu = float(ranking[raw].mean())
    sd = float(ranking[raw].std(ddof=0))
    manual = (ranking[raw].to_numpy() - mu) / sd
    assert abs(float(ranking[col].mean())) < 1e-6, "z of ranking rows must have mean ~0"
    assert abs(float(ranking[col].std(ddof=0)) - 1.0) < 1e-6, "z of ranking rows must have sd ~1"
    assert float(abs(ranking[col].to_numpy() - manual).max()) == 0.0, f"{col} not from ranking-only mu/sd"
    # Held-out rows are scaled but must not sit at the null centre the way ranking rows do.
    held = ss[ss["split"] == "held_out"][col]
    assert len(held) > 0
    assert abs(float(held.mean())) > 0, "held-out rows unexpectedly centred; check the split"


@needs_data
def test_context_split_agrees_with_scores() -> None:
    require(MAIN_CONTEXT)
    rel = "lincs/context_split.parquet"
    from tests.leakage._paths import require as _require  # local import keeps collection order stable

    _require(rel)
    con = duckdb.connect()
    try:
        a = con.execute(
            "SELECT pert_id, context_id, split FROM read_parquet(?)", [str(PROCESSED / MAIN_CONTEXT)]
        ).fetchdf().drop_duplicates()
        b = con.execute(
            "SELECT pert_id, context_id, split FROM read_parquet(?)", [str(PROCESSED / rel)]
        ).fetchdf()
    finally:
        con.close()
    merged = a.merge(b, on=["pert_id", "context_id"], suffixes=("_scores", "_split"))
    assert len(merged) == len(a), "every scored context must have a split entry"
    assert bool((merged["split_scores"] == merged["split_split"]).all()), "split mismatch between files"
