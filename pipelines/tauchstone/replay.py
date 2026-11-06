"""Replay benchmark driver (contracts/algorithms.md section 5).

Replays every candidate x seed x policy at a fixed budget, writing
``benchmark_runs.parquet`` and ``benchmark_summary.json`` (the ``Benchmark``
schema in contracts/openapi.yaml).

Real mode (default) refuses to run unless the preregistration guard passes
(frozen + committed, no uncommitted changes) and records its sha256 + commit.
``--dry-run-synthetic`` skips the guard and runs the full benchmark on the
synthetic world, writing to ``processed/tauchstone/synthetic/`` only and
labelling the outputs synthetic.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import MANIFESTS, PROCESSED
from pipelines.common.provenance import Provenance
from pipelines.tauchstone.engine import (
    POLICIES,
    Context,
    EngineConfig,
    Observation,
    choose,
    p_claim,
    p_survive,
    verdict,
)
from pipelines.tauchstone.evaluation import (
    BOOTSTRAP_REPS,
    BOOTSTRAP_SEED,
    contested_candidates,
    full_information_verdict,
    per_run_frame,
    summarize,
)
from pipelines.tauchstone.truth_table import (
    SYNTHETIC_SEED,
    SyntheticCandidate,
    make_synthetic_world,
    prereg_guard,
)

RUN_COLUMNS = [
    "policy",
    "candidate_id",
    "seed",
    "step",
    "context_id",
    "p_survive_before",
    "outcome",
    "p_claim_before",
    "p_claim_after",
    "verdict",
]

BENCHMARK_POLICIES = list(POLICIES)
ORACLE_POLICY = "oracle"  # harness check only: synthetic dry-runs, never a real summary
SEED_BASE = 20261105
N_SEEDS = 20
BUDGET = 5


def policy_index(policy: str) -> int:
    """Stable rng stream index per policy (oracle gets its own stream)."""
    if policy == ORACLE_POLICY:
        return len(BENCHMARK_POLICIES)
    return BENCHMARK_POLICIES.index(policy)


def oracle_choice(
    cand: SyntheticCandidate,
    hidden: Sequence[Context],
    observations: list[Observation],
    n_total: int,
    cfg: EngineConfig,
) -> tuple[str, float]:
    """Harness-only policy: reveal the hidden context whose TRUE outcome moves
    P(C) furthest toward the full-information verdict. Ties: lower context_id.

    Synthetic only; never enters engine.POLICIES or a real summary.
    """
    full = full_information_verdict(cand.truth, cfg.q)
    base = p_claim(hidden, observations, n_total, cfg)
    best_cid: str | None = None
    best_move = float("-inf")
    for x in sorted(hidden, key=lambda h: h.context_id):
        hypo = Observation(context=x, survive=cand.truth[x.context_id], source="revealed")
        rest = [h for h in hidden if h.context_id != x.context_id]
        pc = p_claim(rest, [*observations, hypo], n_total, cfg)
        move = (pc - base) if full == "SUPPORTED" else (base - pc)
        if move > best_move:  # strict: first (lowest id) wins ties
            best_cid, best_move = x.context_id, move
    assert best_cid is not None
    return best_cid, best_move


def replay_candidate(
    cand: SyntheticCandidate,
    policy: str,
    seed: int,
    budget: int,
    cfg: EngineConfig,
) -> list[dict]:
    """Replay one (candidate, seed, policy): reveal ``budget`` tests greedily."""
    if policy != ORACLE_POLICY and policy not in BENCHMARK_POLICIES:
        raise ValueError(f"unknown policy {policy!r}")
    rng = np.random.default_rng([seed, policy_index(policy)])
    obs: list[Observation] = list(cand.ranking)
    hidden: list[Context] = list(cand.hidden)
    n_total = len(hidden)
    p0 = p_claim(hidden, obs, n_total, cfg)
    rows: list[dict] = [
        {
            "policy": policy,
            "candidate_id": cand.candidate_id,
            "seed": seed,
            "step": 0,
            "context_id": None,
            "p_survive_before": float("nan"),
            "outcome": None,
            "p_claim_before": p0,
            "p_claim_after": p0,
            "verdict": verdict(p0, cfg),
        }
    ]
    for step in range(1, budget + 1):
        if not hidden:
            break
        if policy == ORACLE_POLICY:
            cid, _ = oracle_choice(cand, hidden, obs, n_total, cfg)
        else:
            cid, _, _ = choose(policy, hidden, obs, n_total, cfg, rng)
        ctx = next(h for h in hidden if h.context_id == cid)
        p_before = p_claim(hidden, obs, n_total, cfg)
        ps_before = p_survive(ctx, obs, cfg)
        outcome = bool(cand.truth[cid])
        obs.append(Observation(context=ctx, survive=outcome, source="revealed"))
        hidden = [h for h in hidden if h.context_id != cid]
        p_after = p_claim(hidden, obs, n_total, cfg)
        rows.append(
            {
                "policy": policy,
                "candidate_id": cand.candidate_id,
                "seed": seed,
                "step": step,
                "context_id": cid,
                "p_survive_before": ps_before,
                "outcome": "survive" if outcome else "fail",
                "p_claim_before": p_before,
                "p_claim_after": p_after,
                "verdict": verdict(p_after, cfg),
            }
        )
    return rows


def run_replay(
    world: Sequence[SyntheticCandidate],
    policies: Sequence[str] = BENCHMARK_POLICIES,
    seeds: Sequence[int] | None = None,
    budget: int = BUDGET,
    cfg: EngineConfig | None = None,
) -> pd.DataFrame:
    """Replay the full cross product; returns the benchmark-runs frame."""
    cfg = cfg or EngineConfig()
    seeds = list(seeds) if seeds is not None else [SEED_BASE + i for i in range(N_SEEDS)]
    rows: list[dict] = []
    for cand in world:
        for seed in seeds:
            for policy in policies:
                rows.extend(replay_candidate(cand, policy, seed, budget, cfg))
    df = pd.DataFrame(rows, columns=RUN_COLUMNS)
    return df


def load_world_from_processed(processed: Path) -> list[SyntheticCandidate]:
    """Build the replay world from the real truth table + ranking observations.

    Raises ``FileNotFoundError`` naming the first missing upstream input.
    """
    from pipelines.tauchstone.truth_table import require  # local import: builder helper

    truth_path = require(processed / "tauchstone" / "truth_table.parquet")
    # Ranking observations come from the primary query's ranking context scores.
    from pipelines.tauchstone.truth_table import PRIMARY_QUERY

    ctx_path = require(processed / "scores" / f"{PRIMARY_QUERY}__context_scores.parquet")
    truth = pd.read_parquet(truth_path)
    ctx_scores = pd.read_parquet(ctx_path)
    rank_scores = ctx_scores[ctx_scores["split"] == "ranking"]
    theta = float(truth["threshold"].dropna().median()) if truth["threshold"].notna().any() else -0.5
    world: list[SyntheticCandidate] = []
    for cid, g in truth.groupby("candidate_id"):
        hidden = [
            Context(
                context_id=str(r.context_id),
                type=str(r.context_type),
                label=str(r.label),
                tissue=None if pd.isna(r.tissue) else str(r.tissue),
                region=None if pd.isna(r.region) else str(r.region),
                platform=None if pd.isna(r.platform) else str(r.platform),
                cell_id=None if pd.isna(r.cell_id) else str(r.cell_id),
                pert_idose=None if pd.isna(r.pert_idose) else str(r.pert_idose),
                pert_itime=None if pd.isna(r.pert_itime) else str(r.pert_itime),
            )
            for r in g.itertuples()
        ]
        truth_map = {str(r.context_id): (str(r.outcome) == "survive") for r in g.itertuples()}
        values = {str(r.context_id): r.value for r in g.itertuples() if not pd.isna(r.value)}
        thresholds = {
            str(r.context_id): r.threshold for r in g.itertuples() if not pd.isna(r.threshold)
        }
        rules = {str(r.context_id): str(r.rule) for r in g.itertuples()}
        ranking: list[Observation] = []
        for r in rank_scores[rank_scores["pert_id"].astype(str) == str(cid)].itertuples():
            ctx = Context(
                context_id=str(r.context_id),
                type="lincs_context",
                label=str(r.context_id).replace("|", " · "),
                platform="L1000",
                cell_id=str(r.cell_id),
                pert_idose=str(r.pert_idose),
                pert_itime=str(r.pert_itime),
            )
            ranking.append(
                Observation(context=ctx, survive=float(r.consensus) <= theta, source="ranking")
            )
        world.append(
            SyntheticCandidate(
                candidate_id=str(cid),
                ranking=ranking,
                hidden=hidden,
                truth=truth_map,
                values={k: float(v) for k, v in values.items()},
                thresholds={k: float(v) for k, v in thresholds.items()},
                rules=rules,
            )
        )
    return world


def write_outputs(
    runs: pd.DataFrame,
    summary: dict,
    out_dir: Path,
    seed: int = SYNTHETIC_SEED,
) -> tuple[Path, Path]:
    """Write benchmark_runs.parquet (+ provenance) and benchmark_summary.json."""
    out_dir.mkdir(parents=True, exist_ok=True)
    runs_path = out_dir / "benchmark_runs.parquet"
    runs.to_parquet(runs_path, index=False)
    Provenance(
        step="benchmark_replay",
        dataset_accession="tauchstone/truth_table.parquet",
        parameters={
            "policies": list(runs["policy"].unique()) if len(runs) else [],
            "budget": int(runs["step"].max()) if len(runs) else 0,
            "synthetic": summary.get("synthetic", False),
        },
        random_seed=seed,
        validation_context="replay_benchmark",
    ).write(runs_path)
    summary_path = out_dir / "benchmark_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    return runs_path, summary_path


def build_summary(
    runs: pd.DataFrame,
    truth_by_candidate: dict[str, dict[str, bool]],
    cfg: EngineConfig,
    budget: int,
    prereg_sha256: str,
    prereg_commit: str,
    synthetic: bool = False,
    reps: int = BOOTSTRAP_REPS,
) -> dict:
    """Assemble the Benchmark-schema summary dict.

    Top level = the contested (primary) analysis; ``all_candidates`` carries
    the same structure over every candidate plus ``contested_share``.
    """
    result = summarize(runs, truth_by_candidate, cfg, budget, reps=reps)
    contested, all_block, share = result["contested"], result["all"], result["contested_share"]
    prov = asdict(
        Provenance(
            step="benchmark_summary",
            dataset_accession="tauchstone/truth_table.parquet",
            parameters={
                "synthetic": synthetic,
                "bootstrap_reps": reps,
                "primary_analysis": "contested_candidates",
            },
            random_seed=BOOTSTRAP_SEED,
            validation_context="replay_benchmark",
        )
    )
    return {
        "n_candidates": contested["n_candidates"],
        "n_seeds": contested["n_seeds"],
        "budget": budget,
        "policies": contested["policies"],
        "calibration": contested["calibration"],
        "tests": contested["tests"],
        "preregistration_sha256": prereg_sha256,
        "preregistration_commit": prereg_commit,
        "provenance": prov,
        "contested_share": share,
        "all_candidates": {**all_block, "contested_share": share},
        "synthetic": synthetic,
    }


def harness_check(
    runs: pd.DataFrame,
    truth_by_candidate: dict[str, dict[str, bool]],
    cfg: EngineConfig,
    budget: int,
) -> dict:
    """Synthetic-only harness comparison over contested candidates.

    Compares the oracle against the hybrid and random policies on contested
    decision accuracy at the final step and contested mean
    experiments-to-correct. Never part of a real summary.
    """
    per = per_run_frame(runs, truth_by_candidate, cfg.q, budget)
    cont = contested_candidates(runs)
    sub = per[per["candidate_id"].isin(cont)]
    out: dict[str, dict] = {}
    for pol in (ORACLE_POLICY, "tauchstone_hybrid", "random"):
        s = sub[sub["policy"] == pol]
        if s.empty:
            continue
        full_mapped = s["full"].map({"SUPPORTED": "SUPPORTED_SO_FAR", "FRAGILE": "FRAGILE_CONTEXT_DEPENDENT"})
        acc = float((s["verdict_at_budget"] == full_mapped).mean())
        out[pol] = {
            "n_contested": int(s["candidate_id"].nunique()),
            "contested_decision_accuracy": acc,
            "contested_mean_t_correct": float(s["t_correct"].mean()),
            "contested_median_t_correct": float(s["t_correct"].median()),
        }
    return out


def dry_run_synthetic(
    n_candidates: int = 100,
    n_seeds: int = N_SEEDS,
    budget: int = BUDGET,
    seed: int = SYNTHETIC_SEED,
    out_dir: Path | None = None,
    reps: int = BOOTSTRAP_REPS,
) -> tuple[pd.DataFrame, dict, Path]:
    """Full benchmark on the synthetic world (no guard; synthetic outputs only)."""
    from pipelines.tauchstone.evaluation import select_lambda

    out = out_dir or (PROCESSED / "tauchstone" / "synthetic")
    world = make_synthetic_world(n_candidates=n_candidates, seed=seed)
    # Development pool = ranks 51-100 (disjoint from the benchmark pool), per prereg.
    bench_world, dev_world = world[:50], world[50:]
    best_lam, lam_table = select_lambda(dev_world, budget=budget)
    cfg = replace(EngineConfig(), lam=best_lam)
    seeds = [SEED_BASE + i for i in range(n_seeds)]
    runs = run_replay(
        bench_world, policies=[*BENCHMARK_POLICIES, ORACLE_POLICY], seeds=seeds, budget=budget, cfg=cfg
    )
    truth = {c.candidate_id: c.truth for c in bench_world}
    harness = harness_check(runs, truth, cfg, budget)
    summary = build_summary(
        runs, truth, cfg, budget, "synthetic", "synthetic", synthetic=True, reps=reps
    )
    summary["harness"] = harness
    summary["lambda_selection"] = {"grid_table": lam_table, "best_lambda": best_lam}
    summary["provenance"]["parameters"]["lambda"] = best_lam
    write_outputs(runs, summary, out, seed=seed)
    return runs, summary, out


def main(argv: list[str] | None = None) -> Path:
    """CLI for `make benchmark`."""
    ap = argparse.ArgumentParser(description="Tauchstone replay benchmark")
    ap.add_argument("--dry-run-synthetic", action="store_true")
    ap.add_argument("--n-candidates", type=int, default=100)
    ap.add_argument("--n-seeds", type=int, default=N_SEEDS)
    ap.add_argument("--budget", type=int, default=BUDGET)
    ap.add_argument("--seed", type=int, default=SYNTHETIC_SEED)
    ap.add_argument("--reps", type=int, default=BOOTSTRAP_REPS)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--processed", default=str(PROCESSED))
    args = ap.parse_args(argv)

    if args.dry_run_synthetic:
        _, _, out = dry_run_synthetic(
            n_candidates=args.n_candidates,
            n_seeds=args.n_seeds,
            budget=args.budget,
            seed=args.seed,
            out_dir=Path(args.out_dir) if args.out_dir else None,
            reps=args.reps,
        )
        print(f"synthetic dry-run benchmark written to {out} (clearly labelled synthetic, no guard)")
        return out

    sha, commit = prereg_guard()  # refuses unless frozen + committed
    _ = MANIFESTS  # prereg lives under data/manifests; kept explicit for provenance.
    world = load_world_from_processed(Path(args.processed))
    cfg = EngineConfig()
    seeds = [SEED_BASE + i for i in range(args.n_seeds)]
    runs = run_replay(world, seeds=seeds, budget=args.budget, cfg=cfg)
    truth = {c.candidate_id: c.truth for c in world}
    summary = build_summary(runs, truth, cfg, args.budget, sha, commit, reps=args.reps)
    out_dir = Path(args.out_dir) if args.out_dir else (Path(args.processed) / "tauchstone")
    write_outputs(runs, summary, out_dir, seed=args.seed)
    print(f"wrote {out_dir}/benchmark_runs.parquet + benchmark_summary.json (prereg {sha[:12]} @ {commit[:12]})")
    return out_dir


if __name__ == "__main__":
    main()
