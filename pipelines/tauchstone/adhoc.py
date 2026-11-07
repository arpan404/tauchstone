"""Hidden tests built on the fly for a ranked drug outside the sealed truth table.

Labelled ``not preregistered``: these sessions never feed the benchmark, θ, λ or any ranking.
The rules are exactly the frozen ones in ``contracts/algorithms.md`` section 3, applied to one
drug by reusing the truth-table builder's functions:

- ``held_out_cohort``: each held-out cohort listed in the preregistration (GSE173955; GSE53697 is
  excluded by the cohort QC gate), top-25% rule on ``scores/{cohort}__main__compound_ranking``.
- ``composition_adjusted``: top-25% rule on ``scores/GSE132903__composition_adjusted__compound_ranking``.
- ``lincs_context``: the drug's held-out LINCS contexts (``split == 'held_out'``), at most 8,
  stratified by cell line with seed 20261105; survive iff consensus <= θ (prereg ``theta_value``).
- ``brain_exposure``: only when a measured row exists in ``evidence/exposure.parquet``.

Never writes ``tauchstone/truth_table.parquet``; refuses drugs already in it (their sealed rows are
the only valid hidden tests for them). Server-side only: the rows hold hidden outcomes.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import yaml

from pipelines.common.paths import MANIFESTS, PROCESSED
from pipelines.tauchstone.truth_table import (
    ADJUSTED_QUERY,
    COHORT_META,
    PRIMARY_QUERY,
    SYNTHETIC_SEED,
    TRUTH_TABLE_COLUMNS,
    _exposure_rows,
    _lincs_rows,
    _query_rows,
    top5_rule,
)

SEED = SYNTHETIC_SEED  # 20261105, the frozen LINCS split / sampling seed
NOT_PREREGISTERED = "not preregistered"


class SealedCandidateError(ValueError):
    """The drug is in the sealed truth table; use its frozen rows instead."""


def prereg_theta(manifests: Path = MANIFESTS) -> float:
    """θ from the frozen preregistration (``tauchstone_engine.theta_value``)."""
    prereg = yaml.safe_load((manifests / "preregistration.yaml").read_text())
    return float(prereg["tauchstone_engine"]["theta_value"])


def prereg_cohorts(manifests: Path = MANIFESTS) -> list[str]:
    """Held-out cohorts that passed the frozen QC gate (listed in ``validation_contexts``)."""
    prereg = yaml.safe_load((manifests / "preregistration.yaml").read_text())
    return [
        str(v["id"]) for v in prereg.get("validation_contexts", [])
        if v.get("type") == "held_out_cohort"
    ]


def sealed_candidate_ids(processed: Path = PROCESSED) -> set[str]:
    """Candidate ids in the sealed truth table (read only; empty if the table is absent)."""
    path = processed / "tauchstone" / "truth_table.parquet"
    if not path.exists():
        return set()
    return set(pd.read_parquet(path, columns=["candidate_id"])["candidate_id"].astype(str))


def is_ranked(pert_id: str, processed: Path = PROCESSED, ranking: str = PRIMARY_QUERY) -> bool:
    """True if the drug is in the primary consensus ranking (>= 3 ranking contexts)."""
    path = processed / "scores" / f"{ranking}__compound_ranking.parquet"
    if not path.exists():
        return False
    r = pd.read_parquet(path, columns=["pert_id", "n_ranking_contexts"],
                        filters=[("pert_id", "==", str(pert_id))])
    return bool(len(r) and int(r["n_ranking_contexts"].iloc[0]) >= 3)


def _context_scores(pert_id: str, processed: Path, ranking: str, split: str) -> pd.DataFrame:
    return pd.read_parquet(
        processed / "scores" / f"{ranking}__context_scores.parquet",
        filters=[("pert_id", "==", str(pert_id)), ("split", "==", split)],
    )


def ranking_observations(
    pert_id: str,
    processed: Path = PROCESSED,
    theta: float | None = None,
    ranking: str = PRIMARY_QUERY,
) -> pd.DataFrame:
    """Observed ranking contexts (not hidden): survive iff consensus <= θ (algorithms.md §3)."""
    theta = prereg_theta() if theta is None else float(theta)
    ctx = _context_scores(pert_id, processed, ranking, "ranking").sort_values("context_id")
    ctx = ctx.reset_index(drop=True)
    ctx["survive"] = ctx["consensus"].astype(float) <= theta
    return ctx


def build_adhoc_tests(
    pert_id: str,
    processed: Path = PROCESSED,
    theta: float | None = None,
    seed: int = SEED,
    ranking: str = PRIMARY_QUERY,
    cohorts: list[str] | None = None,
) -> pd.DataFrame:
    """Hidden-test rows (truth-table schema) for one drug outside the sealed set.

    Returns an empty frame when the drug is not in the primary ranking (nothing to test).
    Raises :class:`SealedCandidateError` for a drug already in the truth table.
    Deterministic: same inputs and seed give the same rows.
    """
    pert_id = str(pert_id)
    if pert_id in sealed_candidate_ids(processed):
        raise SealedCandidateError(f"{pert_id} is in the sealed truth table; use its frozen rows")
    empty = pd.DataFrame(columns=TRUTH_TABLE_COLUMNS)
    if not is_ranked(pert_id, processed, ranking):
        return empty
    theta = prereg_theta() if theta is None else float(theta)
    cohorts = prereg_cohorts() if cohorts is None else list(cohorts)
    ids = [pert_id]

    rows: list[dict] = []
    for qc in cohorts:
        path = processed / "scores" / f"{qc}__main__compound_ranking.parquet"
        if not path.exists():
            continue
        cr = pd.read_parquet(path)
        platform, region = COHORT_META.get(qc, ("RNA-seq", "unspecified"))
        rows += _query_rows(
            ids, qc, "held_out_cohort", f"{qc} (held-out cohort)", top5_rule(cr, ids),
            {str(r.pert_id): float(r.consensus_median) for r in cr.itertuples()},
            platform=platform, region=region,
        )
    adj_path = processed / "scores" / f"{ADJUSTED_QUERY}__compound_ranking.parquet"
    if adj_path.exists():
        adj = pd.read_parquet(adj_path)
        platform, region = COHORT_META[ADJUSTED_QUERY]
        rows += _query_rows(
            ids, ADJUSTED_QUERY, "composition_adjusted", "GSE132903 composition-adjusted",
            top5_rule(adj, ids),
            {str(r.pert_id): float(r.consensus_median) for r in adj.itertuples()},
            platform=platform, region=region,
        )
    held = _context_scores(pert_id, processed, ranking, "held_out")
    if len(held):
        rows += _lincs_rows({pert_id: held}, theta, seed=seed)
    if (processed / "evidence" / "exposure.parquet").exists():
        rows += _exposure_rows(ids, processed)
    if not rows:
        return empty
    return pd.DataFrame(rows, columns=TRUTH_TABLE_COLUMNS)


def main(argv: list[str] | None = None) -> pd.DataFrame:
    """Print the adhoc test plan for one drug (context ids and types only, never outcomes)."""
    ap = argparse.ArgumentParser(description="On-the-fly hidden tests for a drug outside the truth table")
    ap.add_argument("pert_id")
    ap.add_argument("--processed", default=str(PROCESSED))
    args = ap.parse_args(argv)
    df = build_adhoc_tests(args.pert_id, Path(args.processed))
    print(f"{args.pert_id}: {len(df)} hidden tests ({NOT_PREREGISTERED})")
    for r in df.itertuples():
        print(f"  {r.context_type:22s} {r.context_id}")
    return df


if __name__ == "__main__":
    main()
