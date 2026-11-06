"""Development-only calibration: type priors, lam / lam_L, proposed values.

INTEGRITY (non-negotiable): every statistic computed from hidden OUTCOMES
(survive rates, claim-holds rate, contested share, accuracies) uses the
DEVELOPMENT pool only — :func:`require_development_only` refuses any frame
containing benchmark-pool rows. For the benchmark pool only counts of
contexts per type are reported (no outcomes). Step-0 beliefs use ranking
observations only, but the contested share is still reported for development
only, to be safe.

Writes data/manifests/preregistration_proposed_values.yaml (never edits
preregistration.yaml; the lead copies the values in and freezes).
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from pipelines.common.paths import MANIFESTS, PROCESSED, REPO
from pipelines.tauchstone.engine import EngineConfig, p_claim, verdict
from pipelines.tauchstone.evaluation import (
    contested_candidates,
    full_information_verdict,
    per_run_frame,
)
from pipelines.tauchstone.replay import BUDGET, N_SEEDS, SEED_BASE, run_replay
from pipelines.tauchstone.truth_table import (
    PRIMARY_QUERY,
    _candidate_pool,
    _default_permctl,
    load_theta,
    require,
)

BENCHMARK = "benchmark"
DEVELOPMENT = "development"
GRID = (0.0, 0.1, 0.25, 0.5, 1.0)


def require_development_only(df: pd.DataFrame, pool_col: str = "pool", context: str = "") -> pd.DataFrame:
    """Refuse any frame containing benchmark-pool rows (outcome statistics are dev-only)."""
    if pool_col in df.columns and bool((df[pool_col] == BENCHMARK).any()):
        raise ValueError(
            f"refusing: {context} received benchmark-pool rows; outcome statistics are "
            "development-only until the preregistration hash is committed"
        )
    return df


def pool_type_counts(truth: pd.DataFrame, pool: pd.DataFrame) -> dict[str, dict[str, int]]:
    """Counts of contexts per type per pool. No outcomes touched (safe for both pools)."""
    slim = truth[["candidate_id", "context_type"]].merge(
        pool[["pert_id", "pool"]], left_on="candidate_id", right_on="pert_id", how="left"
    )
    out: dict[str, dict[str, int]] = {}
    for p, g in slim.groupby("pool"):
        out[str(p)] = {str(k): int(v) for k, v in g["context_type"].value_counts().items()}
    return out


def calibrate(
    processed: Path = PROCESSED,
    ranking: str = PRIMARY_QUERY,
    permctl: str | None = None,
    budget: int = BUDGET,
    n_seeds: int = N_SEEDS,
    seed_base: int = SEED_BASE,
    grid: tuple = GRID,
    out_yaml: Path | None = None,
) -> tuple[dict, Path]:
    """Calibrate on development candidates only; write the proposed-values yaml."""
    from pipelines.tauchstone.evaluation import select_lambda
    from pipelines.tauchstone.replay import load_world_from_processed

    permctl = permctl or _default_permctl()
    pool = _candidate_pool(processed, ranking)
    truth_path = require(processed / "tauchstone" / "truth_table.parquet")
    truth = pd.read_parquet(truth_path)
    merged = truth.merge(
        pool[["pert_id", "pool"]], left_on="candidate_id", right_on="pert_id", how="left"
    )
    counts = pool_type_counts(truth, pool)
    dev = require_development_only(
        merged[merged["pool"] == DEVELOPMENT].copy(), context="calibrate"
    )

    # Type priors m_t: survive rate per context type on development rows.
    m_t = {
        str(t): float((g["outcome"] == "survive").mean())
        for t, g in dev.groupby("context_type")
    }
    # Claim-holds rate on development truth.
    truth_by_cand = {
        cid: dict(zip(g["context_id"].astype(str), g["outcome"] == "survive", strict=True))
        for cid, g in dev.groupby("candidate_id")
    }
    cfg0 = EngineConfig(type_priors=m_t)
    holds = np.mean(
        [full_information_verdict(t, cfg0.q) == "SUPPORTED" for t in truth_by_cand.values()]
    )

    # Development world (ranking obs + hidden) for beliefs and replay.
    dev_world = load_world_from_processed(processed, ranking, permctl, pools=[DEVELOPMENT])
    contested_n = 0
    for cand in dev_world:
        p = p_claim(cand.hidden, list(cand.ranking), len(cand.hidden), cfg0)
        if verdict(p, cfg0) == "INSUFFICIENT_EVIDENCE":
            contested_n += 1
    contested_share = contested_n / len(dev_world) if dev_world else 0.0

    seeds = [seed_base + i for i in range(n_seeds)]
    lam, _ = select_lambda(dev_world, grid=list(grid), seeds=seeds, budget=budget)
    lam_l, _ = select_lambda(
        dev_world, grid=list(grid), seeds=seeds, budget=budget,
        policy="decision_lookahead_hybrid",
    )
    cfg = EngineConfig(type_priors=m_t, lam=lam, lam_lookahead=lam_l)
    runs = run_replay(
        dev_world,
        policies=["random", "greedy_strongest", "max_failure", "max_uncertainty",
                  "expected_decision_change", "tauchstone_hybrid", "decision_lookahead_hybrid"],
        seeds=seeds, budget=budget, cfg=cfg,
    )
    truth_map = {c.candidate_id: c.truth for c in dev_world}
    per = per_run_frame(runs, truth_map, cfg.q, budget)
    cont = contested_candidates(runs)
    full_mapped = per["full"].map({"SUPPORTED": "SUPPORTED_SO_FAR", "FRAGILE": "FRAGILE_CONTEXT_DEPENDENT"})
    # Contested subset is the primary analysis; with real data it may be empty
    # (all step-0 verdicts decisive). The table below covers ALL development
    # runs (development-only outcomes: legitimate); contested-only rows are
    # marked. Empty contested => policy choice cannot matter yet: reported.
    table: dict[str, dict] = {}
    for policy, s in per.groupby("policy"):
        s = s.copy()
        sc = s[s["candidate_id"].isin(cont)]
        table[str(policy)] = {
            "n_contested_runs": int(len(sc)),
            "contested_acc_b3": (float((sc["verdict_at_3"] == full_mapped.loc[sc.index]).mean())
                                if len(sc) else None),
            "contested_acc_b5": (float(sc["correct_at_5"].mean()) if len(sc) else None),
            "all_dev_acc_b3": float((s["verdict_at_3"] == full_mapped.loc[s.index]).mean()),
            "all_dev_acc_b5": float(s["correct_at_5"].mean()),
            "all_dev_mean_t_correct": float(s["t_correct"].mean()),
            "all_dev_median_t_correct": float(s["t_correct"].median()),
            "all_dev_n_runs": int(len(s)),
        }

    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"
    proposed = {
        "note": (
            "Proposed WS5 values from development-pool calibration only. "
            "The lead copies these into preregistration.yaml and freezes; "
            "do not edit that file from here."
        ),
        "type_priors": {k: round(v, 4) for k, v in m_t.items()},
        "lambda": lam,
        "lambda_L": lam_l,
        "theta": load_theta(processed, permctl),
        "ranking": ranking,
        "permctl": permctl,
        "q": cfg.q,
        "kappa": cfg.kappa,
        "development": {
            "n_candidates": int(dev["candidate_id"].nunique()),
            "n_seeds": n_seeds,
            "budget": budget,
            "claim_holds_rate": round(float(holds), 4),
            "contested_share": round(float(contested_share), 4),
            "accuracy_table": table,
        },
        "provenance": {
            "git_commit": commit,
            "timestamp": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
            "truth_table": "processed/tauchstone/truth_table.parquet",
            "benchmark_pool": "counts only, outcomes unseen",
        },
    }
    out = out_yaml or (MANIFESTS / "preregistration_proposed_values.yaml")
    out.write_text(yaml.safe_dump(proposed, sort_keys=False) + "\n")

    # Console report: development outcome stats + benchmark counts only.
    print(f"development candidates: {dev['candidate_id'].nunique()}")
    print(f"development contexts per type: {counts.get(DEVELOPMENT, {})}")
    print("development survive rate per type (m_t): "
          + ", ".join(f"{k}={v:.3f}" for k, v in sorted(m_t.items())))
    print(f"development claim-holds rate: {holds:.3f} contested share: {contested_share:.3f}")
    print(f"selected lam={lam} lam_L={lam_l}")
    for policy, row in table.items():
        print(f"  {policy:26s} cont_acc3 {row['contested_acc_b3']} cont_acc5 {row['contested_acc_b5']} "
              f"| alldev_acc3 {row['all_dev_acc_b3']:.3f} alldev_acc5 {row['all_dev_acc_b5']:.3f} "
              f"mean_t {row['all_dev_mean_t_correct']:.2f} med_t {row['all_dev_median_t_correct']:.1f}")
    print(f"benchmark contexts per type (counts only, outcomes unseen): {counts.get(BENCHMARK, {})}")
    print(f"wrote {out}")
    return proposed, out


def main(argv: list[str] | None = None) -> Path:
    ap = argparse.ArgumentParser(description="Development-only calibration (type priors, lam/lam_L)")
    ap.add_argument("--processed", default=str(PROCESSED))
    ap.add_argument("--ranking", default=PRIMARY_QUERY)
    ap.add_argument("--permctl", default=None, help="permutation-control run (default: prereg permutation_control_run)")
    ap.add_argument("--budget", type=int, default=BUDGET)
    ap.add_argument("--n-seeds", type=int, default=N_SEEDS)
    ap.add_argument("--out-yaml", default=None)
    args = ap.parse_args(argv)
    _, out = calibrate(
        Path(args.processed), ranking=args.ranking, permctl=args.permctl,
        budget=args.budget, n_seeds=args.n_seeds,
        out_yaml=Path(args.out_yaml) if args.out_yaml else None,
    )
    return out


if __name__ == "__main__":
    main()
