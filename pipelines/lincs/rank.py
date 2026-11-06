"""LINCS reversal ranking CLI (WS3, Part D + spec 5-8).

Usage:
  uv run python -m pipelines.lincs.rank --signature <path to {cohort}__main.parquet> \\
      --out-name <name> [--permutations <path> --workers N]

Writes processed/scores/{name}__signature_scores.parquet
  (sig_id, pert_id, context_id, split, wtcs, ks, cosine,
   z_wtcs, z_ks, z_cosine, consensus),
processed/scores/{name}__compound_ranking.parquet
  (rank, pert_id, pert_iname, consensus_median, consensus_q25, consensus_q75,
   consensus_iqr, n_ranking_contexts, z_wtcs_median, z_ks_median, z_cosine_median),
processed/scores/{name}__context_scores.parquet
  (pert_id, context_id, split, cell_id, pert_idose, pert_itime,
   consensus, z_wtcs, z_ks, z_cosine; held-out rows included, server-side only).

Standardisation mu/sd come from RANKING-split signatures only (spec 5) and
apply to held-out rows on the same scale. With --permutations, the fallback
set rule (top 150 ignoring FDR) is used for BOTH the real and permuted
queries, and the permutation null/summary/theta outputs of spec 8 are written.
"""

from __future__ import annotations

import argparse
import multiprocessing as mp
import os
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import PROCESSED
from pipelines.common.provenance import Provenance
from pipelines.lincs.aggregate import SPLIT_SEED, aggregate_scores
from pipelines.lincs.scoring import (
    SET_SIZE,
    QuerySets,
    Scorer,
    build_query_sets,
    build_query_sets_no_fdr,
)

STAT_CANDIDATES = ["stat", "logFC", "t"]
FDR_CANDIDATES = ["fdr", "adj.P.Val", "padj"]
P_CANDIDATES = ["p_value", "P.Value"]


def pick_column(df: pd.DataFrame, candidates: list[str]) -> str:
    for c in candidates:
        if c in df.columns:
            return c
    raise KeyError(f"none of {candidates} in signature columns {list(df.columns)}")


def load_signature(path: Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_parquet(path)
    mapping = {"entrez_id": "entrez_id", "stat": pick_column(df, STAT_CANDIDATES)}
    mapping["fdr"] = pick_column(df, FDR_CANDIDATES) if any(
        c in df.columns for c in FDR_CANDIDATES) else ""
    mapping["p_value"] = next((c for c in P_CANDIDATES if c in df.columns), "")
    return df, mapping


def load_lincs(block: int = 50_000) -> dict:
    d = PROCESSED / "lincs"
    X = np.load(d / "level5_landmark_f32.npy", mmap_mode="r")
    order = np.load(d / "order_i16.npy", mmap_mode="r")
    rank = np.load(d / "rank_i16.npy", mmap_mode="r")
    sig_info = pd.read_parquet(d / "sig_info.parquet")
    split = pd.read_parquet(d / "context_split.parquet")
    landmark = pd.read_parquet(d / "landmark_order.parquet").sort_values("col")
    return {"X": X, "scorer": Scorer(X, order, rank, block=block),
            "sig_info": sig_info, "split": split,
            "landmark": landmark["entrez_id"].astype(str).tolist()}


def ranking_mask(sig_info: pd.DataFrame, split: pd.DataFrame) -> np.ndarray:
    m = split.set_index(["pert_id", "context_id"])["split"]
    return np.asarray(sig_info.set_index(["pert_id", "context_id"]).index.map(m) == "ranking")


def run_query(scorer: Scorer, sets: QuerySets, mask: np.ndarray) -> dict[str, np.ndarray]:
    return scorer.score(sets, ranking_mask=mask)


_PERM_CTX: dict = {}


def _perm_worker_init(lincs_dir: str, block: int) -> None:
    """Spawn initializer: cap BLAS threads, load mmap arrays + metadata once."""
    for var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
        os.environ.setdefault(var, "1")
    import numpy as _np
    import pandas as _pd

    d = Path(lincs_dir)
    _PERM_CTX["scorer"] = Scorer(
        _np.load(d / "level5_landmark_f32.npy", mmap_mode="r"),
        _np.load(d / "order_i16.npy", mmap_mode="r"),
        _np.load(d / "rank_i16.npy", mmap_mode="r"),
        block=block)
    _PERM_CTX["sig_info"] = _pd.read_parquet(d / "sig_info.parquet")
    _PERM_CTX["split"] = _pd.read_parquet(d / "context_split.parquet")
    _PERM_CTX["landmark"] = (
        _pd.read_parquet(d / "landmark_order.parquet").sort_values("col")["entrez_id"]
        .astype(str).tolist())
    _PERM_CTX["mask"] = ranking_mask(_PERM_CTX["sig_info"], _PERM_CTX["split"])


def _perm_worker(task: tuple) -> dict:
    """Score one permutation. task = (perm_id, entrez, stat)."""
    perm_id, ent, st = task
    q = pd.DataFrame({"entrez_id": ent, "stat": st})
    sets = build_query_sets_no_fdr(q, _PERM_CTX["landmark"])
    res = _PERM_CTX["scorer"].score(sets, ranking_mask=_PERM_CTX["mask"])
    sig_info = _PERM_CTX["sig_info"]
    sig = pd.DataFrame({"pert_id": sig_info["pert_id"].to_numpy(),
                        "context_id": sig_info["context_id"].to_numpy(),
                        "consensus": res["consensus"]})
    split_map = _PERM_CTX["split"].set_index(["pert_id", "context_id"])["split"]
    sig["split"] = np.asarray(sig.set_index(["pert_id", "context_id"]).index.map(split_map))
    ctx = sig.groupby(["pert_id", "context_id", "split"], as_index=False)["consensus"].mean()
    comp = (ctx[ctx["split"] == "ranking"].groupby("pert_id")["consensus"]
            .median().reset_index().rename(columns={"consensus": "consensus_median"}))
    return {"perm_id": perm_id,
            "compounds": comp,
            "ctx_ranking_consensus": ctx.loc[ctx["split"] == "ranking", "consensus"].to_numpy()}


def run_permutations(lincs_dir: Path, perm_path: Path, real_top50: pd.DataFrame,
                     block: int, workers: int) -> tuple[pd.DataFrame, pd.DataFrame, float]:
    """Full pipeline per permutation; returns (null, summary, theta)."""
    perms = pd.read_parquet(perm_path)
    perm_ids = perms["perm_id"].unique().tolist()
    tasks = [(pid,
              perms.loc[perms["perm_id"] == pid, "entrez_id"].to_numpy(),
              perms.loc[perms["perm_id"] == pid, "stat"].to_numpy())
             for pid in perm_ids]
    for var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS",
                "VECLIB_MAXIMUM_THREADS"):
        os.environ.setdefault(var, "1")
    with mp.get_context("spawn").Pool(workers, _perm_worker_init, (str(lincs_dir), block)) as pool:
        results = pool.map(_perm_worker, tasks)
    null_rows = []
    ctx_pooled: list[np.ndarray] = []
    for r in results:
        c = r["compounds"]
        c.insert(0, "perm_id", r["perm_id"])
        null_rows.append(c)
        ctx_pooled.append(r["ctx_ranking_consensus"])
    null = pd.concat(null_rows, ignore_index=True)[["perm_id", "pert_id", "consensus_median"]]
    n_perms = len(perm_ids)
    theta = float(np.quantile(np.concatenate(ctx_pooled), 0.05))
    top50 = real_top50.head(50)
    summ = []
    for _, row in top50.iterrows():
        dist = null.loc[null["pert_id"] == row["pert_id"], "consensus_median"].to_numpy()
        p_perm = float((1 + (dist <= row["consensus_median"]).sum()) / (1 + n_perms))
        summ.append({"pert_id": row["pert_id"], "real_score": float(row["consensus_median"]),
                     "p_perm": p_perm})
    summary = pd.DataFrame(summ)
    return null, summary, theta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--signature", required=True)
    ap.add_argument("--out-name", required=True)
    ap.add_argument("--permutations", default=None)
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 8)
    ap.add_argument("--block", type=int, default=50_000)
    args = ap.parse_args()

    lincs = load_lincs(block=args.block)
    sig_info, split = lincs["sig_info"], lincs["split"]
    mask = ranking_mask(sig_info, split)
    query, mapping = load_signature(Path(args.signature))

    use_perm_rule = args.permutations is not None
    if use_perm_rule:
        qstd = query.rename(columns={mapping["stat"]: "stat"})
        sets = build_query_sets_no_fdr(qstd, lincs["landmark"])
    else:
        qstd = query.rename(columns={mapping["stat"]: "stat",
                                     mapping["fdr"]: "fdr"} if mapping["fdr"] else {mapping["stat"]: "stat"})
        kwargs = {} if not mapping["p_value"] else {"p_col": mapping["p_value"]}
        sets = build_query_sets(qstd, lincs["landmark"], fdr_col="fdr", **kwargs)

    res = run_query(lincs["scorer"], sets, mask)
    sig_scores = pd.DataFrame({
        "sig_id": sig_info["sig_id"].to_numpy(), "pert_id": sig_info["pert_id"].to_numpy(),
        "context_id": sig_info["context_id"].to_numpy(),
        "split": sig_info.set_index(["pert_id", "context_id"]).index.map(
            split.set_index(["pert_id", "context_id"])["split"]).to_numpy(),
        "wtcs": res["wtcs"], "ks": res["ks"], "cosine": res["cosine"],
        "z_wtcs": res["z_wtcs"], "z_ks": res["z_ks"], "z_cosine": res["z_cosine"],
        "consensus": res["consensus"]})
    context_scores, compound_ranking = aggregate_scores(sig_scores, split, sig_meta=sig_info)

    out = PROCESSED / "scores"
    out.mkdir(parents=True, exist_ok=True)
    sig_path = out / f"{args.out_name}__signature_scores.parquet"
    ctx_path = out / f"{args.out_name}__context_scores.parquet"
    rank_path = out / f"{args.out_name}__compound_ranking.parquet"
    sig_scores.to_parquet(sig_path, index=False)
    context_scores.to_parquet(ctx_path, index=False)
    compound_ranking.to_parquet(rank_path, index=False)

    params = {"signature": str(args.signature), "column_mapping": mapping,
              "gene_space": "landmark_978", "set_size": SET_SIZE,
              "methods": ["wtcs", "ks", "cosine"], "weights": [1 / 3] * 3,
              "standardisation": "ranking-contexts-only",
              "split_seed": SPLIT_SEED, "n_up": sets.n_up, "n_down": sets.n_down,
              "up_n_fdr": sets.up_n_fdr, "down_n_fdr": sets.down_n_fdr,
              "query_set_fallback": sets.fdr_fallback,
              "permutation_rule_for_real": use_perm_rule,
              "n_ranking_sigs": int(mask.sum()), "block": args.block}
    Provenance(step="lincs_rank", dataset_accession=["GSE92742", "GSE70138"],
               parameters=params, random_seed=SPLIT_SEED).write(sig_path)
    Provenance(step="lincs_rank_contexts", dataset_accession=["GSE92742", "GSE70138"],
               parameters=params, random_seed=SPLIT_SEED).write(ctx_path)
    Provenance(step="lincs_rank_compounds", dataset_accession=["GSE92742", "GSE70138"],
               parameters=params, random_seed=SPLIT_SEED).write(rank_path)

    if use_perm_rule:
        assert args.permutations is not None
        null, summary, theta = run_permutations(
            PROCESSED / "lincs", Path(args.permutations), compound_ranking,
            args.block, args.workers)
        null_path = out / f"{args.out_name}__permutation_null.parquet"
        summ_path = out / f"{args.out_name}__permutation_summary.parquet"
        null.to_parquet(null_path, index=False)
        summary.to_parquet(summ_path, index=False)
        top20 = summary.head(20)
        frac = float((top20["p_perm"] < 0.05).mean()) if len(top20) else float("nan")
        passes = bool((top20["p_perm"] < 0.05).all()) if len(top20) else False
        perm_params = {**params, "n_perms": int(null["perm_id"].nunique()),
                       "theta": theta, "perm_control_passes_top20": passes,
                       "fraction_top20_p_perm_lt_0.05": frac}
        Provenance(step="lincs_permutation_control", dataset_accession=["GSE92742", "GSE70138"],
                   parameters=perm_params, random_seed=SPLIT_SEED).write(null_path)
        Provenance(step="lincs_permutation_summary", dataset_accession=["GSE92742", "GSE70138"],
                   parameters=perm_params, random_seed=SPLIT_SEED).write(summ_path)
        print({"theta": theta, "perm_control_passes_top20": passes,
               "fraction_top20": frac, "n_perms": perm_params["n_perms"]})
    print({"n_sigs": len(sig_scores), "n_compounds_ranked": len(compound_ranking),
           "n_up": sets.n_up, "n_down": sets.n_down, "fallback": sets.fdr_fallback})


if __name__ == "__main__":
    main()
