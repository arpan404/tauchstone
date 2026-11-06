"""Permutation-control numbers quoted in docs/integrity_log.md, computed one way, from saved files.

For a permutation-control run (scores/{run}__compound_ranking + __permutation_null) and a scope
(all ranked compounds, or the clinical-stage pool = drug_map stage_num >= PHASE_1):

- compound p_perm: for each of the scope's top 20, p = (1 + #perms where that compound's null
  consensus <= its real consensus) / (1 + n_perms); count p < 0.05.
- selection-aware rank-matched check: for k = 1..20, compare the scope's real k-th best consensus
  with the 5th percentile, across permutations, of the k-th best consensus among ALL compounds in
  the scope. This asks whether shuffled labels would produce top scores this extreme anywhere in
  the pool, which accounts for picking the top 20 out of the whole pool.

Usage: uv run python -m pipelines.lincs.permutation_report
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from pipelines.common.paths import PROCESSED

RUNS = ("GSE132903__permctl", "GSE132903__gold_permctl")  # all signatures, gold only
TOP = 20


def scope_frames(run: str, scope: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    ranking = pd.read_parquet(PROCESSED / "scores" / f"{run}__compound_ranking.parquet")
    null = pd.read_parquet(PROCESSED / "scores" / f"{run}__permutation_null.parquet")
    if scope == "clinical":
        dm = pd.read_parquet(PROCESSED / "evidence" / "drug_map.parquet", columns=["pert_id", "stage_num"])
        ranking = ranking.merge(dm, on="pert_id").query("stage_num >= 3")
    elif scope != "all":
        raise ValueError(scope)
    return ranking.sort_values("rank").reset_index(drop=True), null


def rank_matched_curve(run: str, scope: str) -> tuple[np.ndarray, np.ndarray]:
    """(real k-th best, null 5th percentile of the k-th best over the whole scope), k = 1..20."""
    ranking, null = scope_frames(run, scope)
    pool_null = null[null["pert_id"].isin(ranking["pert_id"])]
    kth = np.vstack(pool_null.groupby("perm_id")["consensus_median"]
                    .apply(lambda x: np.sort(x.to_numpy())[:TOP]).to_numpy())
    return ranking["consensus_median"].to_numpy()[:TOP], np.quantile(kth, 0.05, axis=0)


def control_numbers(run: str, scope: str) -> dict:
    ranking, null = scope_frames(run, scope)
    top = ranking.head(TOP)[["pert_id", "consensus_median"]]
    n_perms = null["perm_id"].nunique()
    nn = null[null["pert_id"].isin(top["pert_id"])].merge(
        top.rename(columns={"consensus_median": "real"}), on="pert_id")
    hits = nn.assign(hit=nn["consensus_median"] <= nn["real"]).groupby("pert_id")["hit"].sum()
    p_perm = (hits + 1) / (n_perms + 1)
    pool_null = null[null["pert_id"].isin(ranking["pert_id"])]
    kth = np.vstack(pool_null.groupby("perm_id")["consensus_median"]
                    .apply(lambda x: np.sort(x.to_numpy())[:TOP]).to_numpy())
    q05 = np.quantile(kth, 0.05, axis=0)
    real = top["consensus_median"].to_numpy()
    return {"run": run, "scope": scope, "n_scope": len(ranking), "n_perms": int(n_perms),
            "top20_p_lt_0.05": int((p_perm < 0.05).sum()),
            "rank_matched_beats_null": int((real < q05).sum()),
            "real_best": float(real[0]), "null_best_median": float(np.median(kth[:, 0])),
            "null_best_p05": float(q05[0])}


def main() -> None:
    rows = [control_numbers(run, scope) for run in RUNS for scope in ("all", "clinical")]
    print(pd.DataFrame(rows).round(3).to_string(index=False))


if __name__ == "__main__":
    main()
