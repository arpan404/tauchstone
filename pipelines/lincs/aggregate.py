"""Per-compound LINCS context split + aggregation (WS3, Parts C + spec 6-7).

Held-out LINCS contexts must never enter the ranking: per compound, contexts
(cell_id | dose | time) are sorted by context_id, then floor(0.3 * n_contexts)
are held out with numpy default_rng(seed=20261105), never leaving fewer than
3 ranking contexts::

    held_out = max(0, min(floor(0.3 * n), n - 3))

Context level = mean consensus over signatures sharing (pert_id, context_id).
Compound level = median over RANKING contexts only; q25/q75 of consensus;
n_ranking_contexts; median of each z method. Rank ascending by
consensus_median (most negative = rank 1); compounds with
n_ranking_contexts < 3 are excluded from the ranking file.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

HELD_OUT_FRACTION = 0.3
MIN_RANKING_CONTEXTS = 3
SPLIT_SEED = 20261105


def n_held_out(n_contexts: int, frac: float = HELD_OUT_FRACTION) -> int:
    """Number of held-out contexts for a compound with n contexts."""
    return max(0, min(math.floor(frac * n_contexts), n_contexts - MIN_RANKING_CONTEXTS))


def make_context_split(
    sig_info: pd.DataFrame,
    seed: int = SPLIT_SEED,
    frac: float = HELD_OUT_FRACTION,
) -> pd.DataFrame:
    """Deterministic per-compound ranking/held_out split.

    Input needs columns pert_id, context_id. Returns
    (pert_id, context_id, split). Compounds iterate sorted by pert_id and the
    RNG is consumed in that order, so the result is fully deterministic.
    """
    rng = np.random.default_rng(seed)
    pairs = sig_info[["pert_id", "context_id"]].drop_duplicates().sort_values(["pert_id", "context_id"])
    rows: list[tuple[str, str, str]] = []
    for pert_id, grp in pairs.groupby("pert_id", sort=True):
        ctx = sorted(grp["context_id"].tolist())
        k = n_held_out(len(ctx), frac)
        held = set(rng.choice(len(ctx), size=k, replace=False).tolist()) if k else set()
        for i, c in enumerate(ctx):
            rows.append((str(pert_id), c, "held_out" if i in held else "ranking"))
    return pd.DataFrame(rows, columns=["pert_id", "context_id", "split"])


def aggregate_scores(
    sig_scores: pd.DataFrame,
    split: pd.DataFrame,
    sig_meta: pd.DataFrame | None = None,
    min_ranking_contexts: int = MIN_RANKING_CONTEXTS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Context means then compound medians over RANKING contexts only.

    sig_scores needs (sig_id, pert_id, context_id, consensus, z_wtcs, z_ks,
    z_cosine); pert_iname is taken from sig_meta (sig_id -> pert_iname,
    cell_id, pert_idose, pert_itime) when given, else from sig_scores.
    Returns (context_scores, compound_ranking):

    * context_scores: pert_id, context_id, split, cell_id, pert_idose,
      pert_itime, consensus, z_wtcs, z_ks, z_cosine (held-out rows included;
      server-side only, later feeds the truth table).
    * compound_ranking: rank, pert_id, pert_iname, consensus_median,
      consensus_q25, consensus_q75, consensus_iqr, n_ranking_contexts,
      z_wtcs_median, z_ks_median, z_cosine_median; sorted ascending by
      consensus_median; compounds below min_ranking_contexts excluded.
    """
    split_map = split.set_index(["pert_id", "context_id"])["split"]
    df = sig_scores.copy()
    df["split"] = df.set_index(["pert_id", "context_id"]).index.map(split_map)
    if df["split"].isna().any():
        missing = df.loc[df["split"].isna(), ["pert_id", "context_id"]].drop_duplicates()
        raise KeyError(f"{len(missing)} scored pairs lack a split: {missing.head()}")
    by = ["pert_id", "context_id", "split"]
    context_scores = df.groupby(by, as_index=False)[["consensus", "z_wtcs", "z_ks", "z_cosine"]].mean()
    if sig_meta is not None:
        meta = sig_meta.drop_duplicates("context_id" if "pert_id" not in sig_meta.columns
                                        else ["pert_id", "context_id"])
        context_scores = context_scores.merge(
            meta[["pert_id", "context_id", "cell_id", "pert_idose", "pert_itime"]
                 + (["pert_iname"] if "pert_iname" in meta.columns else [])],
            on=["pert_id", "context_id"], how="left", validate="many_to_one")
    elif "pert_iname" in df.columns:
        iname = df.drop_duplicates("pert_id")[["pert_id", "pert_iname"]]
        context_scores = context_scores.merge(iname, on="pert_id", how="left")
    cols = ["pert_id", "context_id", "split"] + [c for c in
            ["cell_id", "pert_idose", "pert_itime"] if c in context_scores.columns] + \
        ["consensus", "z_wtcs", "z_ks", "z_cosine"]
    context_scores = context_scores[cols]

    ranking = context_scores[context_scores["split"] == "ranking"]
    counts = ranking.groupby("pert_id")["context_id"].nunique().rename("n_ranking_contexts")
    g = ranking.groupby("pert_id")
    med = g[["consensus", "z_wtcs", "z_ks", "z_cosine"]].median()
    q25 = g[["consensus"]].quantile(0.25).rename(columns={"consensus": "consensus_q25"})
    q75 = g[["consensus"]].quantile(0.75).rename(columns={"consensus": "consensus_q75"})
    comp = med.join([q25, q75, counts])
    comp = comp[comp["n_ranking_contexts"] >= min_ranking_contexts].copy()
    comp["consensus_iqr"] = comp["consensus_q75"] - comp["consensus_q25"]
    comp = comp.rename(columns={"consensus": "consensus_median", "z_wtcs": "z_wtcs_median",
                                "z_ks": "z_ks_median", "z_cosine": "z_cosine_median"}).reset_index()
    if sig_meta is not None and "pert_iname" in sig_meta.columns:
        iname = sig_meta.drop_duplicates("pert_id")[["pert_id", "pert_iname"]]
        comp = comp.merge(iname, on="pert_id", how="left", validate="many_to_one")
    elif "pert_iname" in sig_scores.columns:
        iname = sig_scores.drop_duplicates("pert_id")[["pert_id", "pert_iname"]]
        comp = comp.merge(iname, on="pert_id", how="left", validate="many_to_one")
    comp = comp.sort_values("consensus_median", ascending=True).reset_index(drop=True)
    comp.insert(0, "rank", np.arange(1, len(comp) + 1))
    comp = comp[["rank", "pert_id"] + (["pert_iname"] if "pert_iname" in comp.columns else []) +
                ["consensus_median", "consensus_q25", "consensus_q75", "consensus_iqr",
                 "n_ranking_contexts", "z_wtcs_median", "z_ks_median", "z_cosine_median"]]
    return context_scores, comp
