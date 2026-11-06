"""Check 7 — permutation-control report (gold LINCS signatures).

Reports compound-level p_perm for the clinical pool top 20 and the
rank-matched check (real k-th best vs null 5th percentile of k-th best,
k=1..20, both scoped to the clinical pool top 20). Saves the deck plot to
``docs/figures/permutation_control.png``.

The integrity log cites 17/20 and 15/20; the ``test_log_numbers_reconcile``
test below locks that claim and is expected to fail (xfail) until the lead
reconciles the log with the current files.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np
import pytest

from tests.leakage._paths import (
    GOLD_NULL,
    GOLD_RANKING,
    GOLD_SUMMARY,
    POOL,
    PROCESSED,
    needs_data,
    require,
)

pytestmark = needs_data

REPO = Path(__file__).resolve().parents[2]
FIGURE = REPO / "docs" / "figures" / "permutation_control.png"


def _load():
    require(GOLD_NULL, GOLD_SUMMARY, GOLD_RANKING, POOL)
    con = duckdb.connect()
    try:
        null = con.execute(
            "SELECT perm_id, pert_id, consensus_median FROM read_parquet(?)",
            [str(PROCESSED / GOLD_NULL)],
        ).fetchdf()
        summ = con.execute(
            "SELECT pert_id, real_score, p_perm FROM read_parquet(?)",
            [str(PROCESSED / GOLD_SUMMARY)],
        ).fetchdf()
        gold_rank = con.execute(
            "SELECT pert_id, consensus_median FROM read_parquet(?)",
            [str(PROCESSED / GOLD_RANKING)],
        ).fetchdf()
        pool = con.execute(
            "SELECT pert_id, pool_rank FROM read_parquet(?) WHERE pool = 'benchmark' AND pool_rank <= 20",
            [str(PROCESSED / POOL)],
        ).fetchdf()
    finally:
        con.close()
    return null, summ, gold_rank, pool


def _rank_matched(null, gold_rank, clin_ids):
    """Real k-th best vs null 5th percentile of k-th best, clinical-pool scoped."""
    gmap = dict(zip(gold_rank["pert_id"], gold_rank["consensus_median"], strict=True))
    real = np.sort(np.array([gmap[p] for p in clin_ids if p in gmap]))
    sub = null[null["pert_id"].isin(clin_ids)]
    mat = np.array([sorted(g["consensus_median"].values)[: len(real)] for _, g in sub.groupby("perm_id")])
    q5 = np.quantile(mat, 0.05, axis=0)
    return real, q5


def test_permutation_control_report_and_plot() -> None:
    null, summ, gold_rank, pool = _load()
    clin_ids = pool.sort_values("pool_rank")["pert_id"].tolist()
    assert null["perm_id"].nunique() == 200
    real, q5 = _rank_matched(null, gold_rank, clin_ids)
    beats = int((real < q5).sum())
    print(f"\nclinical pool top 20 rank-matched beats (gold): {beats}/20")
    pmap = dict(zip(summ["pert_id"], summ["p_perm"], strict=True))
    pvals = [(p, pmap.get(p)) for p in clin_ids]
    have = [(p, v) for p, v in pvals if v is not None]
    print(f"clinical top 20 with compound p_perm (top-50 overall only): {len(have)}/20")
    for p, v in have:
        print(f"  {p}: p_perm={v:.4f}")
    FIGURE.parent.mkdir(parents=True, exist_ok=True)
    k = np.arange(1, len(real) + 1)
    plt.figure(figsize=(8, 4.5))
    plt.plot(k, real, "o-", label="real k-th best (clinical top 20, gold scores)")
    plt.plot(k, q5, "s--", label="null 5th percentile of k-th best (200 perms)")
    plt.fill_between(k, q5, real, where=(real < q5), alpha=0.2, label=f"beats null ({beats}/20)")
    plt.xlabel("k (rank within clinical pool top 20)")
    plt.ylabel("compound consensus (negative = reversal)")
    plt.title("Permutation control (gold LINCS): real vs rank-matched null")
    plt.legend(fontsize=8)
    plt.tight_layout()
    plt.savefig(FIGURE, dpi=150)
    plt.close()
    assert FIGURE.exists()
    assert beats >= 1, "real top candidates must beat the rank-matched null somewhere"


@pytest.mark.xfail(
    strict=True,
    reason="integrity log row 8 cites 17/20 and 15/20; current gold files give "
    "16/20 (full top-20 p<0.05) and 17/20 (clinical-scoped rank-matched). Lead to reconcile.",
)
def test_log_numbers_reconcile() -> None:
    null, summ, gold_rank, pool = _load()
    strict_gate = int((summ.head(20)["p_perm"] < 0.05).sum())
    clin_ids = pool.sort_values("pool_rank")["pert_id"].tolist()
    real, q5 = _rank_matched(null, gold_rank, clin_ids)
    assert strict_gate == 17, f"strict gate (gold full top 20 p<0.05): {strict_gate}/20, log says 17/20"
    assert int((real < q5).sum()) == 15, "rank-matched: log says 15/20"
