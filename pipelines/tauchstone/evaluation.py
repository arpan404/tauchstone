"""Replay-benchmark metrics (contracts/algorithms.md section 5).

Pure functions over replay rows: full-information verdicts, experiments to
correct verdict, fragile recall, decision accuracy, Brier/calibration, cluster
bootstrap CIs, paired Wilcoxon + Holm vs the hybrid, and lambda selection on
development candidates.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace

import numpy as np
import pandas as pd
from scipy.stats import wilcoxon
from statsmodels.stats.multitest import multipletests

from pipelines.tauchstone.engine import POLICIES, EngineConfig
from pipelines.tauchstone.truth_table import SyntheticCandidate

BOOTSTRAP_REPS = 2000
BOOTSTRAP_SEED = 20261105
CENSORED = None  # resolved per-run as budget + 1


def full_information_verdict(truth: Mapping[str, bool], q: float) -> str:
    """SUPPORTED if the claim holds on every hidden outcome, else FRAGILE."""
    n = len(truth)
    n_survive = sum(1 for v in truth.values() if v)
    return "SUPPORTED" if n_survive >= np.ceil(q * n - 1e-9) else "FRAGILE"


def _verdict_matches(full: str, v: str) -> bool:
    return (full == "SUPPORTED" and v == "SUPPORTED_SO_FAR") or (
        full == "FRAGILE" and v == "FRAGILE_CONTEXT_DEPENDENT"
    )


def per_run_frame(
    runs: pd.DataFrame, truth_by_candidate: Mapping[str, Mapping[str, bool]], q: float, budget: int
) -> pd.DataFrame:
    """One row per (policy, candidate, seed) with run-level metrics.

    Includes step-0 rows: a decisive step-0 verdict matching the full
    verdict gives t_correct = 0. Columns: policy, candidate_id, seed, full
    (full-information verdict), t_correct (experiments to correct verdict,
    budget+1 if censored), verdict_at_{3,5}, verdict_at_budget,
    correct_at_5, correct_at_budget.
    """
    full = {cid: full_information_verdict(t, q) for cid, t in truth_by_candidate.items()}
    out: list[dict] = []
    for (policy, cid, seed), g in runs.groupby(["policy", "candidate_id", "seed"]):
        g = g.sort_values("step")
        steps = g["step"].tolist()
        verdicts = g["verdict"].tolist()
        f = full[cid]
        t_correct = budget + 1
        for s, v in zip(steps, verdicts, strict=True):
            if v != "INSUFFICIENT_EVIDENCE" and _verdict_matches(f, v):
                t_correct = int(s)
                break
        by_step = dict(zip(steps, verdicts, strict=True))
        v_budget = by_step.get(budget, "INSUFFICIENT_EVIDENCE")
        row = {
            "policy": policy,
            "candidate_id": cid,
            "seed": seed,
            "full": f,
            "t_correct": t_correct,
            "verdict_at_budget": v_budget,
            "correct_at_budget": _verdict_matches(f, v_budget),
        }
        for b in (3, 5):
            row[f"verdict_at_{b}"] = by_step.get(b)
        row["correct_at_5"] = _verdict_matches(f, by_step.get(5, "INSUFFICIENT_EVIDENCE"))
        out.append(row)
    return pd.DataFrame(out)


def contested_candidates(runs: pd.DataFrame) -> list[str]:
    """Candidates whose step-0 verdict is INSUFFICIENT_EVIDENCE (primary analysis set)."""
    s0 = runs[runs["step"] == 0][["candidate_id", "verdict"]].drop_duplicates()
    return sorted(s0.loc[s0["verdict"] == "INSUFFICIENT_EVIDENCE", "candidate_id"].tolist())


def _cluster_bootstrap_ci(
    values: np.ndarray,
    cand_idx: np.ndarray,
    stat_fn,
    reps: int = BOOTSTRAP_REPS,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """Percentile 95% CI of ``stat_fn`` under the cluster bootstrap.

    ``values`` is (n_candidates, n_seeds); each rep resamples candidates with
    replacement and keeps all their seeds. Reps that yield no data (e.g. no
    fragile candidate drawn) are skipped; if none yield data, returns (nan, nan).
    """
    rng = np.random.default_rng(seed)
    n = len(cand_idx)
    stats: list[float] = []
    draw = rng.integers(0, n, size=(reps, n))
    for r in range(reps):
        sample = values[draw[r]].reshape(-1)
        sample = sample[~np.isnan(sample)]
        if sample.size == 0:
            continue
        stats.append(float(stat_fn(sample)))
    if not stats:
        return (float("nan"), float("nan"))
    return (float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5)))


def _ordered_candidates(runs: pd.DataFrame) -> list[str]:
    cands = sorted(runs["candidate_id"].unique().tolist())
    return cands


def _analyze(
    runs: pd.DataFrame,
    truth_by_candidate: Mapping[str, Mapping[str, bool]],
    cfg: EngineConfig,
    budget: int,
    reps: int = BOOTSTRAP_REPS,
    bootstrap_seed: int = BOOTSTRAP_SEED,
) -> dict:
    """One analysis block: {n_candidates, n_seeds, budget, policies, calibration, tests}."""
    runs = runs[runs["policy"].isin(POLICIES)]
    per = per_run_frame(runs, truth_by_candidate, cfg.q, budget)
    cands = _ordered_candidates(runs)
    cindex = {c: i for i, c in enumerate(cands)}
    fragile_cands = {c for c in cands if full_information_verdict(truth_by_candidate[c], cfg.q) == "FRAGILE"}

    policies: list[dict] = []
    test_metric_by_policy: dict[str, np.ndarray] = {}  # per-candidate seed-means of t_correct
    for pol in POLICIES:
        sub = per[per["policy"] == pol]
        if sub.empty:
            continue
        t = sub["t_correct"].to_numpy(dtype=float)
        median = float(np.median(t))
        q25, q75 = (float(v) for v in np.percentile(t, [25, 75]))
        n_seeds = int(sub["seed"].nunique())
        mat = np.full((len(cands), n_seeds), np.nan)
        seed_order = {s: j for j, s in enumerate(sorted(sub["seed"].unique()))}
        for (_, r) in sub.iterrows():
            mat[cindex[r["candidate_id"]], seed_order[r["seed"]]] = r["t_correct"]
        med_lo, med_hi = _cluster_bootstrap_ci(mat, np.arange(len(cands)), np.median, reps, bootstrap_seed)

        recalls = {}
        for b in (3, 5):
            col = f"verdict_at_{b}"
            fsub = sub[sub["candidate_id"].isin(fragile_cands)]
            est = float((fsub[col] == "FRAGILE_CONTEXT_DEPENDENT").mean()) if len(fsub) else float("nan")
            fmat = np.full((len(cands), n_seeds), np.nan)
            for _, r in fsub.iterrows():
                fmat[cindex[r["candidate_id"]], seed_order[r["seed"]]] = (
                    1.0 if r[col] == "FRAGILE_CONTEXT_DEPENDENT" else 0.0
                )
            # Non-fragile candidates contribute NaN rows (skipped unless drawn alone).
            lo, hi = _cluster_bootstrap_ci(fmat, np.arange(len(cands)), np.mean, reps, bootstrap_seed + b)
            recalls[b] = (est, lo, hi)

        acc = sub["correct_at_5"].to_numpy(dtype=float)
        acc_est = float(acc.mean())
        amat = np.full((len(cands), n_seeds), np.nan)
        for _, r in sub.iterrows():
            amat[cindex[r["candidate_id"]], seed_order[r["seed"]]] = float(r["correct_at_5"])
        acc_lo, acc_hi = _cluster_bootstrap_ci(amat, np.arange(len(cands)), np.mean, reps, bootstrap_seed + 7)

        rev = runs[(runs["policy"] == pol) & (runs["step"] >= 1)]
        errs = (rev["p_survive_before"] - (rev["outcome"] == "survive").astype(float)) ** 2
        brier = float(errs.mean()) if len(rev) else None

        # Per-candidate seed-mean of t_correct for the paired tests.
        means = np.nanmean(mat, axis=1)
        test_metric_by_policy[pol] = means
        policies.append(
            {
                "policy": pol,
                "label": pol,
                "experiments_to_correct_verdict": {
                    "median": median,
                    "iqr": [q25, q75],
                    "ci95": [med_lo, med_hi],
                },
                "fragile_recall_at_3": {"estimate": recalls[3][0], "ci95": [recalls[3][1], recalls[3][2]]},
                "fragile_recall_at_5": {"estimate": recalls[5][0], "ci95": [recalls[5][1], recalls[5][2]]},
                "decision_accuracy": {"estimate": acc_est, "ci95": [acc_lo, acc_hi]},
                "brier": brier,
            }
        )

    # Calibration: 10 equal-width bins over p_survive_before at reveal time (step >= 1).
    calibration: list[dict] = []
    revealed = runs[runs["step"] >= 1]
    if len(revealed):
        edges = np.linspace(0.0, 1.0, 11)
        pred = revealed["p_survive_before"].to_numpy(dtype=float)
        obs = (revealed["outcome"] == "survive").to_numpy(dtype=float)
        for i in range(10):
            lo_e, hi_e = float(edges[i]), float(edges[i + 1])
            m = (pred >= lo_e) & (pred < hi_e if i < 9 else pred <= hi_e)
            if m.sum() == 0:
                calibration.append(
                    {
                        "bin_lo": lo_e,
                        "bin_hi": hi_e,
                        "mean_predicted": float("nan"),
                        "observed_rate": float("nan"),
                        "n": 0,
                    }
                )
            else:
                calibration.append(
                    {
                        "bin_lo": lo_e,
                        "bin_hi": hi_e,
                        "mean_predicted": float(pred[m].mean()),
                        "observed_rate": float(obs[m].mean()),
                        "n": int(m.sum()),
                    }
                )

    # Paired Wilcoxon (per-candidate seed-means) hybrid vs each other + Holm.
    tests: list[dict] = []
    if "tauchstone_hybrid" in test_metric_by_policy:
        ref = test_metric_by_policy["tauchstone_hybrid"]
        raw: list[tuple[str, float, float]] = []
        for pol in POLICIES:
            if pol == "tauchstone_hybrid" or pol not in test_metric_by_policy:
                continue
            x = test_metric_by_policy[pol]
            mask = ~(np.isnan(x) | np.isnan(ref))
            d = x[mask] - ref[mask]
            if d.size == 0 or np.all(d == 0):
                stat, p = 0.0, 1.0
            else:
                try:
                    res = wilcoxon(d)
                    stat, p = float(res.statistic), float(res.pvalue)
                except ValueError:
                    stat, p = 0.0, 1.0
            raw.append((pol, stat, p))
        if raw:
            pvals = [p for _, _, p in raw]
            _, p_holm, _, _ = multipletests(pvals, method="holm")
            for (pol, stat, _), ph in zip(raw, p_holm, strict=True):
                tests.append(
                    {
                        "policy_a": "tauchstone_hybrid",
                        "policy_b": pol,
                        "metric": "experiments_to_correct_verdict",
                        "statistic": stat,
                        "p_holm": float(ph),
                    }
                )
    return {
        "n_candidates": int(runs["candidate_id"].nunique()) if len(runs) else 0,
        "n_seeds": int(runs["seed"].nunique()) if len(runs) else 0,
        "budget": budget,
        "policies": policies,
        "calibration": calibration,
        "tests": tests,
    }


def summarize(
    runs: pd.DataFrame,
    truth_by_candidate: Mapping[str, Mapping[str, bool]],
    cfg: EngineConfig,
    budget: int,
    reps: int = BOOTSTRAP_REPS,
    bootstrap_seed: int = BOOTSTRAP_SEED,
) -> dict:
    """Two-block summary: 'contested' (step-0 INSUFFICIENT, the PRIMARY analysis) and 'all'.

    Returns {"contested": block, "all": block, "contested_share": float}.
    Wilcoxon+Holm tests run on the contested set. Non-competitor policies
    (e.g. the synthetic oracle) are excluded from both blocks upstream.
    """
    contested = contested_candidates(runs)
    n_all = int(runs["candidate_id"].nunique()) if len(runs) else 0
    return {
        "contested": _analyze(
            runs[runs["candidate_id"].isin(contested)], truth_by_candidate, cfg, budget, reps, bootstrap_seed
        ),
        "all": _analyze(runs, truth_by_candidate, cfg, budget, reps, bootstrap_seed),
        "contested_share": (len(contested) / n_all) if n_all else 0.0,
    }


def select_lambda(
    dev_world: Sequence[SyntheticCandidate],
    grid: Sequence[float] = (0.0, 0.1, 0.25, 0.5, 1.0),
    seeds: Sequence[int] = (20261105, 20261106, 20261107, 20261108, 20261109),
    budget: int = 5,
    base_cfg: EngineConfig | None = None,
    policy: str = "tauchstone_hybrid",
) -> tuple[float, list[dict]]:
    """Pick hybrid lambda on development candidates: decision accuracy, then median t_correct.

    Runs ``policy`` (a '*_hybrid' policy whose acquisition adds lam*(1-p_x))
    with each grid lambda over the dev world and the given seeds. Returns
    (best_lambda, table rows); ties broken toward the smaller grid value
    (first max wins).
    """
    from pipelines.tauchstone.replay import run_replay  # local import: replay drives sessions

    base = base_cfg or EngineConfig()
    table: list[dict] = []
    for lam in grid:
        cfg = replace(base, lam=float(lam))
        runs = run_replay(dev_world, policies=[policy], seeds=list(seeds), budget=budget, cfg=cfg)
        truth = {c.candidate_id: c.truth for c in dev_world}
        per = per_run_frame(runs, truth, cfg.q, budget)
        acc = float(per["correct_at_5"].mean()) if len(per) else float("nan")
        med = float(per["t_correct"].median()) if len(per) else float("inf")
        table.append({"lambda": float(lam), "decision_accuracy": acc, "median_t_correct": med})
    best = max(table, key=lambda r: (r["decision_accuracy"], -r["median_t_correct"]))
    return float(best["lambda"]), table
