"""EXPERIMENT: decision-lookahead policies vs the six prereg policies.

Honesty protocol (lead review): lam selection and every comparison run ONLY
on synthetic worlds with seeds disjoint from the dry-run benchmark world
(default 9001-9005), never on real data. Candidate policies never enter
``engine.POLICIES``, replay defaults, or a real summary.

Outputs (labelled synthetic): processed/tauchstone/synthetic/lookahead_experiment/.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import wilcoxon
from statsmodels.stats.multitest import multipletests

from pipelines.common.paths import PROCESSED
from pipelines.tauchstone.engine import EngineConfig
from pipelines.tauchstone.evaluation import (
    _cluster_bootstrap_ci,
    contested_candidates,
    full_information_verdict,
    per_run_frame,
    select_lambda,
)
from pipelines.tauchstone.replay import ORACLE_POLICY, run_replay
from pipelines.tauchstone.truth_table import make_synthetic_world

EXPERIMENT_WORLDS = (9001, 9002, 9003, 9004, 9005)
EXPERIMENT_POLICIES = (
    "random",
    "expected_decision_change",
    "tauchstone_hybrid",
    "max_failure",
    "decision_lookahead",
    "decision_lookahead_hybrid",
    ORACLE_POLICY,
)
GRID = (0.0, 0.1, 0.25, 0.5, 1.0)
BOOTSTRAP_REPS = 2000
BOOTSTRAP_SEED = 20261105


def run_world(
    world_seed: int,
    n_candidates: int = 100,
    n_seeds: int = 20,
    budget: int = 5,
    seed_base: int = 20261105,
) -> tuple[pd.DataFrame, dict, dict]:
    """One fresh world: lam selection on dev half, full-policy replay on eval half.

    Returns (eval-half runs incl. step-0 rows, truth map, info dict with the
    selected lambdas and per-policy replay seconds per session).
    """
    world = make_synthetic_world(n_candidates=n_candidates, seed=world_seed)
    dev_world, eval_world = world[50:], world[:50]
    dev_seeds = [seed_base + i for i in range(5)]
    lam_hybrid, _ = select_lambda(dev_world, grid=list(GRID), seeds=dev_seeds, budget=budget)
    lam_lookahead, _ = select_lambda(
        dev_world, grid=list(GRID), seeds=dev_seeds, budget=budget,
        policy="decision_lookahead_hybrid",
    )
    cfgs = {
        "tauchstone_hybrid": replace(EngineConfig(), lam=lam_hybrid),
        "decision_lookahead_hybrid": replace(EngineConfig(), lam=lam_lookahead),
    }
    default_cfg = EngineConfig()
    seeds = [seed_base + i for i in range(n_seeds)]
    frames: list[pd.DataFrame] = []
    timings: dict[str, float] = {}
    for policy in EXPERIMENT_POLICIES:
        cfg = cfgs.get(policy, default_cfg)
        t0 = time.perf_counter()
        frames.append(run_replay(eval_world, policies=[policy], seeds=seeds, budget=budget, cfg=cfg))
        dt = time.perf_counter() - t0
        timings[policy] = dt / (len(eval_world) * len(seeds))
    runs = pd.concat(frames, ignore_index=True)
    # Prefix candidate ids so pooled worlds never collide in the bootstrap.
    runs["candidate_id"] = f"W{world_seed}::" + runs["candidate_id"].astype(str)
    truth = {f"W{world_seed}::{c.candidate_id}": c.truth for c in eval_world}
    info = {
        "world_seed": world_seed,
        "lam_hybrid": lam_hybrid,
        "lam_lookahead": lam_lookahead,
        "seconds_per_session": timings,
    }
    return runs, truth, info


def _metric_ci(
    s: pd.DataFrame,
    col: str,
    fn,
    cands: list[str],
    cindex: dict[str, int],
    seed_order: dict,
    n_seeds: int,
    reps: int,
) -> dict:
    """Point estimate (NaN-aware) + cluster-bootstrap 95% CI for one metric column."""
    vals = s[col].to_numpy(dtype=float)
    vals = vals[~np.isnan(vals)]
    est = float(fn(vals)) if vals.size else float("nan")
    mat = np.full((len(cands), n_seeds), np.nan)
    for _, r in s.iterrows():
        mat[cindex[r["candidate_id"]], seed_order[r["seed"]]] = r[col]
    lo, hi = _cluster_bootstrap_ci(mat, np.arange(len(cands)), fn, reps, BOOTSTRAP_SEED)
    return {"estimate": est, "ci95": [lo, hi]}


def summarize_experiment(
    per: pd.DataFrame, contested: list[str], reps: int = BOOTSTRAP_REPS
) -> dict[str, dict]:
    """Pooled contested metrics per policy with cluster-bootstrap 95% CIs."""
    sub = per[per["candidate_id"].isin(contested)].copy()
    cands = sorted(sub["candidate_id"].unique().tolist())
    cindex = {c: i for i, c in enumerate(cands)}
    full_mapped = sub["full"].map({"SUPPORTED": "SUPPORTED_SO_FAR", "FRAGILE": "FRAGILE_CONTEXT_DEPENDENT"})
    sub["acc_b3"] = (sub["verdict_at_3"] == full_mapped).astype(float)
    sub["acc_b5"] = (sub["correct_at_5"]).astype(float)
    is_frag = (sub["full"] == "FRAGILE").to_numpy()
    sub["frag3"] = np.where(is_frag, (sub["verdict_at_3"] == "FRAGILE_CONTEXT_DEPENDENT").astype(float), np.nan)
    sub["frag5"] = np.where(
        is_frag,
        ((sub["full"] == "FRAGILE") & sub["correct_at_5"].astype(bool)).astype(float),
        np.nan,
    )
    sub["insuff"] = (sub["verdict_at_5"] == "INSUFFICIENT_EVIDENCE").astype(float)
    out: dict[str, dict] = {}
    for policy in EXPERIMENT_POLICIES:
        s = sub[sub["policy"] == policy]
        if s.empty:
            continue
        n_seeds = int(s["seed"].nunique())
        seed_order = {x: j for j, x in enumerate(sorted(s["seed"].unique()))}

        entry = {
            "n_contested": int(s["candidate_id"].nunique()),
            "acc_b3": _metric_ci(s, "acc_b3", np.mean, cands, cindex, seed_order, n_seeds, reps),
            "acc_b5": _metric_ci(s, "acc_b5", np.mean, cands, cindex, seed_order, n_seeds, reps),
            "fragile_recall_b3": _metric_ci(s, "frag3", np.mean, cands, cindex, seed_order, n_seeds, reps),
            "fragile_recall_b5": _metric_ci(s, "frag5", np.mean, cands, cindex, seed_order, n_seeds, reps),
            "mean_t_correct": _metric_ci(s, "t_correct", np.mean, cands, cindex, seed_order, n_seeds, reps),
            "median_t_correct": _metric_ci(s, "t_correct", np.median, cands, cindex, seed_order, n_seeds, reps),
            "insufficient_fraction": _metric_ci(s, "insuff", np.mean, cands, cindex, seed_order, n_seeds, reps),
        }
        out[policy] = entry
    return out


def paired_tests(per: pd.DataFrame, contested: list[str]) -> list[dict]:
    """Paired Wilcoxon on per-candidate seed-means: lookahead(_hybrid) vs hybrid and vs random.

    Primary metric: decision accuracy (correct_at_5 means); secondary:
    experiments-to-correct means. Holm over the four comparisons per metric.
    """
    sub = per[per["candidate_id"].isin(contested)]
    results: list[dict] = []
    for metric in ("correct_at_5", "t_correct"):
        means: dict[str, np.ndarray] = {}
        cands = sorted(sub["candidate_id"].unique().tolist())
        for policy in ("random", "tauchstone_hybrid", "decision_lookahead", "decision_lookahead_hybrid"):
            s = sub[sub["policy"] == policy]
            if s.empty:
                continue
            pivot = s.pivot_table(index="candidate_id", columns="seed", values=metric, aggfunc="mean")
            pivot = pivot.reindex(cands)
            means[policy] = pivot.mean(axis=1).to_numpy(dtype=float)
        pairs = [
            ("decision_lookahead", "tauchstone_hybrid"),
            ("decision_lookahead", "random"),
            ("decision_lookahead_hybrid", "tauchstone_hybrid"),
            ("decision_lookahead_hybrid", "random"),
        ]
        raw: list[tuple[str, str, float, float]] = []
        for a, b in pairs:
            if a not in means or b not in means:
                continue
            mask = ~(np.isnan(means[a]) | np.isnan(means[b]))
            dd = means[a][mask] - means[b][mask]
            if dd.size == 0 or np.all(dd == 0):
                stat, p = 0.0, 1.0
            else:
                try:
                    res = wilcoxon(dd)
                    stat, p = float(res.statistic), float(res.pvalue)
                except ValueError:
                    stat, p = 0.0, 1.0
            raw.append((a, b, stat, p))
        if raw:
            _, p_holm, _, _ = multipletests([p for _, _, _, p in raw], method="holm")
            for (a, b, stat, _), ph in zip(raw, p_holm, strict=True):
                results.append(
                    {"policy_a": a, "policy_b": b, "metric": metric, "statistic": stat, "p_holm": float(ph)}
                )
    return results


def run_protocol(
    worlds: tuple[int, ...] = EXPERIMENT_WORLDS,
    n_candidates: int = 100,
    n_seeds: int = 20,
    budget: int = 5,
    out_dir: Path | None = None,
    reps: int = BOOTSTRAP_REPS,
) -> tuple[dict, Path]:
    """Run the full honesty protocol and write the labelled-synthetic report."""
    out = out_dir or (PROCESSED / "tauchstone" / "synthetic" / "lookahead_experiment")
    out.mkdir(parents=True, exist_ok=True)
    frames, truth_all, infos = [], {}, []
    for ws in worlds:
        runs, truth, info = run_world(ws, n_candidates, n_seeds, budget)
        frames.append(runs)
        truth_all.update(truth)
        infos.append(info)
    runs_all = pd.concat(frames, ignore_index=True)
    cfg = EngineConfig()  # q only; per_run_frame needs the threshold fraction
    per = per_run_frame(runs_all, truth_all, cfg.q, budget)
    contested = contested_candidates(runs_all)
    metrics = summarize_experiment(per, contested, reps=reps)
    tests = paired_tests(per, contested)
    claim_holds = float(
        np.mean([full_information_verdict(t, cfg.q) == "SUPPORTED" for t in truth_all.values()])
    )
    report = {
        "synthetic": True,
        "note": "EXPERIMENT only: candidate policies, never real data, never the six prereg policies.",
        "worlds": infos,
        "n_eval_candidates": int(runs_all["candidate_id"].nunique()),
        "n_seeds": n_seeds,
        "budget": budget,
        "claim_holds_rate": claim_holds,
        "contested_share": len(contested) / runs_all["candidate_id"].nunique(),
        "metrics": metrics,
        "tests": tests,
    }
    (out / "lookahead_experiment.json").write_text(json.dumps(report, indent=1) + "\n")
    return report, out


def main(argv: list[str] | None = None) -> Path:
    ap = argparse.ArgumentParser(description="Decision-lookahead honesty protocol (synthetic only)")
    ap.add_argument("--worlds", nargs="+", type=int, default=list(EXPERIMENT_WORLDS))
    ap.add_argument("--n-candidates", type=int, default=100)
    ap.add_argument("--n-seeds", type=int, default=20)
    ap.add_argument("--budget", type=int, default=5)
    ap.add_argument("--reps", type=int, default=BOOTSTRAP_REPS)
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args(argv)
    report, out = run_protocol(
        worlds=tuple(args.worlds),
        n_candidates=args.n_candidates,
        n_seeds=args.n_seeds,
        budget=args.budget,
        out_dir=Path(args.out_dir) if args.out_dir else None,
        reps=args.reps,
    )
    print(f"experiment written to {out}")
    for policy, m in report["metrics"].items():
        print(
            f"{policy:26s} acc3 {m['acc_b3']['estimate']:.3f} acc5 {m['acc_b5']['estimate']:.3f} "
            f"fr3 {m['fragile_recall_b3']['estimate']:.3f} fr5 {m['fragile_recall_b5']['estimate']:.3f} "
            f"mean_t {m['mean_t_correct']['estimate']:.2f} med_t {m['median_t_correct']['estimate']:.2f} "
            f"insuff {m['insufficient_fraction']['estimate']:.3f}"
        )
    return out


if __name__ == "__main__":
    main()
