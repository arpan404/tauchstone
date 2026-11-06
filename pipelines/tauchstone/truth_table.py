"""Truth-table builder: hidden validation outcomes per candidate (server-only).

Real build (needs upstream tables that other workstreams are still computing):
rows for the benchmark pool (top 50) and the development pool (ranks 51-100),
one row per hidden context in S_d — see contracts/algorithms.md section 3 and
contracts/parquet/README.md for the ``tauchstone/truth_table`` schema.

Synthetic build (available now): :func:`make_synthetic_world`, used by the
test-suite and the ``--dry-run-synthetic`` benchmark.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import MANIFESTS, PROCESSED
from pipelines.common.provenance import Provenance
from pipelines.tauchstone.engine import Context, Observation

TRUTH_TABLE_COLUMNS = [
    "candidate_id",
    "context_id",
    "context_type",
    "label",
    "value",
    "threshold",
    "outcome",
    "rule",
    "tissue",
    "region",
    "platform",
    "cell_id",
    "pert_idose",
    "pert_itime",
]

#: Survive cutoff for signature-type contexts: the candidate must be in this top fraction of ranked
#: compounds (prereg; top 25% chosen on the development pool, see contracts/algorithms.md section 3).
TOP_FRACTION = 0.25

#: Held-out cohort queries backing the top-fraction survive rule.
COHORT_QUERIES = ["GSE173955", "GSE53697"]
ADJUSTED_QUERY = "GSE132903__composition_adjusted"
PRIMARY_QUERY = "GSE132903__main"

SYNTHETIC_SEED = 20261105
MAX_LINCS_CONTEXTS = 8


def require(path: Path) -> Path:
    """Return ``path`` or raise a clear error naming the missing upstream input."""
    if not path.exists():
        raise FileNotFoundError(
            f"missing upstream input: {path} "
            "(run the owning workstream's pipeline first; see contracts/parquet/README.md)"
        )
    return path


def _default_permctl() -> str:
    """Permutation-control run name from the preregistration (gold since 0f4c619)."""
    import yaml

    prereg = yaml.safe_load((MANIFESTS / "preregistration.yaml").read_text())
    return str(
        prereg.get("ranking", {}).get("permutation_control_run", "GSE132903__gold_permctl")
    )


def load_theta(processed: Path = PROCESSED, permctl: str | None = None) -> float:
    """Theta from the permutation-control null sidecar (also checks the summary sidecar).

    Raises ``FileNotFoundError`` for a missing input and ``ValueError`` when the
    two sidecars disagree.
    """
    permctl = permctl or _default_permctl()
    null_sidecar = require(processed / "scores" / f"{permctl}__permutation_null.parquet.provenance.json")
    theta = json.loads(null_sidecar.read_text())["parameters"]["theta"]
    summary_sidecar = processed / "scores" / f"{permctl}__permutation_summary.parquet.provenance.json"
    if summary_sidecar.exists():
        stheta = json.loads(summary_sidecar.read_text())["parameters"].get("theta")
        if stheta is not None and abs(float(stheta) - float(theta)) > 1e-9:
            raise ValueError(f"theta mismatch: null sidecar {theta} vs summary sidecar {stheta}")
    return float(theta)


def _heldout_cohort_ids() -> list[str]:
    """Held-out cohort ids listed in the preregistration."""
    import yaml

    prereg = yaml.safe_load((MANIFESTS / "preregistration.yaml").read_text())
    return [v["id"] for v in prereg.get("validation_contexts", []) if v.get("type") == "held_out_cohort"]


RULES = {
    "held_out_cohort": (
        "Survives if the drug is among the 25% most-reversing compounds for this cohort's signature."
    ),
    "composition_adjusted": (
        "Survives if the drug is among the 25% most-reversing compounds for the "
        "composition-adjusted signature."
    ),
    "lincs_context": (
        "Survives if this held-out LINCS context's consensus is at or below theta, the 25th "
        "percentile of the shuffled-label null (the reversal holds outside the ranking contexts)."
    ),
    "brain_exposure": (
        "Survives on measured CNS evidence: human CNS PK, or brain/plasma Kp >= 0.1, "
        "or PAMPA-BBB Pe >= 4e-6 cm/s."
    ),
}

#: Held-out cohorts evaluated by the QC gate (GSE53697 is expected to fail it).
HELD_OUT_COHORTS = ["GSE173955", "GSE53697"]

#: Display metadata for cohort-type rows.
COHORT_META = {
    "GSE173955": ("RNA-seq", "hippocampus"),
    "GSE53697": ("RNA-seq", "unspecified"),
    ADJUSTED_QUERY: ("Illumina array", "middle temporal gyrus"),
}


def cohort_gate(
    processed: Path,
    ranking: str = PRIMARY_QUERY,
    cohorts: Sequence[str] = HELD_OUT_COHORTS,
    min_rho: float = 0.2,
) -> dict[str, dict]:
    """Correlation QC gate: Spearman rho of each held-out signature vs the primary.

    Computed over shared entrez_id ``stat`` values. Returns
    {cohort: {rho, n_shared, threshold, included}}. Raises ``FileNotFoundError``
    naming a missing signature.
    """
    from scipy.stats import spearmanr

    primary = pd.read_parquet(require(processed / "signatures" / f"{ranking}.parquet"))
    pstat = primary.set_index("entrez_id")["stat"]
    gate: dict[str, dict] = {}
    for cid in cohorts:
        sig = pd.read_parquet(require(processed / "signatures" / f"{cid}__main.parquet"))
        sstat = sig.set_index("entrez_id")["stat"]
        shared = pstat.index.intersection(sstat.index)
        rho = float(spearmanr(pstat.loc[shared], sstat.loc[shared]).statistic)
        gate[cid] = {
            "rho": rho,
            "n_shared": int(len(shared)),
            "threshold": min_rho,
            "included": bool(rho >= min_rho),
        }
    return gate


def top5_rule(
    compound_ranking: pd.DataFrame, candidate_ids: Sequence[str], min_contexts: int = 3
) -> dict[str, dict]:
    """Top-fraction survive rule per candidate: {cid: {ranked, rank, cutoff, survive, detail}}.

    A candidate is ranked only with >= ``min_contexts`` ranking contexts in
    this query; unranked candidates fail with detail 'not rankable'. The cutoff
    is ceil(TOP_FRACTION * n_ranked) on the query's own rank-1-most-negative ordering.
    """
    n_ranked = len(compound_ranking)
    cutoff = max(1, int(np.ceil(TOP_FRACTION * n_ranked)))
    by_id = {str(r.pert_id): r for r in compound_ranking.itertuples()}
    out: dict[str, dict] = {}
    for cid in candidate_ids:
        row = by_id.get(str(cid))
        ranked = row is not None and int(row.n_ranking_contexts) >= min_contexts
        rank = int(row.rank) if ranked else None
        survive = bool(ranked and rank <= cutoff)
        out[str(cid)] = {
            "ranked": bool(ranked),
            "rank": rank,
            "cutoff": cutoff,
            "n_ranked": n_ranked,
            "survive": survive,
            "detail": "" if ranked else "not rankable",
        }
    return out


def _query_rows(
    candidate_ids: Sequence[str],
    query: str,
    context_type: str,
    label: str,
    results: dict[str, dict],
    value_by_id: Mapping[str, float | None],
    platform: str | None = None,
    region: str | None = None,
) -> list[dict]:
    """One row per candidate for a top-fraction compound query (cohort or adjusted)."""
    rows = []
    for cid in candidate_ids:
        r = results[str(cid)]
        rule = RULES[context_type]
        if not r["ranked"]:
            rule += " Candidate not rankable (fewer than 3 ranking contexts): fail."
        rows.append(
            {
                "candidate_id": cid,
                "context_id": query,
                "context_type": context_type,
                "label": label,
                "value": value_by_id.get(str(cid)),
                "threshold": None,  # rank-based rule: no scalar threshold
                "outcome": "survive" if r["survive"] else "fail",
                "rule": rule,
                "tissue": None,
                "region": region,
                "platform": platform,
                "cell_id": None,
                "pert_idose": None,
                "pert_itime": None,
            }
        )
    return rows


def _parse_lincs_context(context_id: str) -> tuple[str | None, str | None, str | None]:
    """Split a 'cell|dose|time' context_id; missing parts become None."""
    parts = str(context_id).split("|")
    parts += [None] * (3 - len(parts))
    cell, dose, time = (p if p else None for p in parts[:3])
    return cell, dose, time


def _lincs_rows(
    held_by_candidate: Mapping[str, pd.DataFrame],
    theta: float,
    seed: int = SYNTHETIC_SEED,
) -> list[dict]:
    """Held-out LINCS rows: consensus <= theta survives, value = consensus.

    At most 8 contexts per candidate, stratified by cell line (round-robin
    over cell lines with a seeded shuffle). Metadata parsed from context_id.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for cid, held in held_by_candidate.items():
        ctxs = sorted(held["context_id"].astype(str).unique())
        by_cell: dict[str, list[str]] = {}
        for c in ctxs:
            cell, _, _ = _parse_lincs_context(c)
            by_cell.setdefault(cell or "unspecified", []).append(c)
        for cell_ctxs in by_cell.values():
            rng.shuffle(cell_ctxs)
        picked: list[str] = []
        while len(picked) < MAX_LINCS_CONTEXTS and any(by_cell.values()):
            for cell in sorted(by_cell):
                if by_cell[cell] and len(picked) < MAX_LINCS_CONTEXTS:
                    picked.append(by_cell[cell].pop(0))
        cons = held.set_index("context_id")["consensus"].to_dict()
        for c in sorted(picked):
            v = cons.get(c)
            cell, dose, time = _parse_lincs_context(c)
            rows.append(
                {
                    "candidate_id": cid,
                    "context_id": c,
                    "context_type": "lincs_context",
                    "label": str(c).replace("|", " · ") + " (held-out)",
                    "value": None if v is None else float(v),
                    "threshold": float(theta),
                    "outcome": "survive" if (v is not None and float(v) <= theta) else "fail",
                    "rule": RULES["lincs_context"],
                    "tissue": None,
                    "region": None,
                    "platform": "L1000",
                    "cell_id": cell,
                    "pert_idose": dose,
                    "pert_itime": time,
                }
            )
    return rows


def _exposure_rows(candidate_ids: list[str], processed: Path) -> list[dict]:
    """Brain-exposure rows: survive only on measured evidence above thresholds.

    A candidate with no measured exposure rows gets NO context (untestable,
    not a failure); fail only when measured values are below the thresholds.
    """
    exposure_path = require(processed / "evidence" / "exposure.parquet")
    exposure = pd.read_parquet(exposure_path)
    measured = exposure[exposure["is_measured"].astype(bool)]
    rows = []
    for cid in candidate_ids:
        rows_ev = measured[measured["pert_id"].astype(str) == cid]
        if len(rows_ev) == 0:
            continue  # untestable: the context is not in S_d
        survive = False
        for r in rows_ev.itertuples():
            m, v = str(r.measure), float(r.value)
            if m == "kp" and v >= 0.1:
                survive = True
                break
            if m == "pampa_pe" and v >= 4e-6:
                survive = True
                break
            if m == "csf":
                survive = True
                break
        rows.append(
            {
                "candidate_id": cid,
                "context_id": "brain_exposure",
                "context_type": "brain_exposure",
                "label": "measured brain exposure",
                "value": None,  # heterogeneous measures; see evidence card
                "threshold": None,
                "outcome": "survive" if survive else "fail",
                "rule": RULES["brain_exposure"],
                "tissue": None,
                "region": None,
                "platform": None,
                "cell_id": None,
                "pert_idose": None,
                "pert_itime": None,
            }
        )
    return rows


def _candidate_pool(processed: Path, ranking: str) -> pd.DataFrame:
    """Eligible candidates (benchmark + development pools, pool_rank 1-100)."""
    pool = pd.read_parquet(require(processed / "scores" / f"{ranking}__candidate_pool.parquet"))
    pool = pool[pool["pool"].isin(["benchmark", "development"])].copy()
    return pool.sort_values("pool_rank").reset_index(drop=True)


def build_truth_table(
    processed: Path = PROCESSED,
    ranking: str = PRIMARY_QUERY,
    permctl: str | None = None,
    seed: int = SYNTHETIC_SEED,
) -> tuple[pd.DataFrame, dict]:
    """Build the full truth table (both pools; server-side only) from real upstream tables.

    Returns (table, provenance parameters incl. theta, cohort-gate log and
    exposure flag). Raises ``FileNotFoundError`` naming the first missing
    upstream input. Prints no outcome statistics (integrity: benchmark-pool
    outcomes stay unseen until the preregistration is frozen).
    """
    import yaml

    pool = _candidate_pool(processed, ranking)
    candidate_ids = pool["pert_id"].astype(str).tolist()
    pools = dict(zip(pool["pert_id"].astype(str), pool["pool"], strict=True))
    theta = load_theta(processed, permctl)
    permctl = permctl or _default_permctl()
    ctx_scores = pd.read_parquet(require(processed / "scores" / f"{ranking}__context_scores.parquet"))
    min_rho = float(
        yaml.safe_load((MANIFESTS / "preregistration.yaml").read_text())
        .get("cohort_qc_gate", {})
        .get("spearman_vs_primary_min", 0.2)
    )
    gate = cohort_gate(processed, ranking, HELD_OUT_COHORTS, min_rho=min_rho)
    passing = [cid for cid in HELD_OUT_COHORTS if gate[cid]["included"]]

    rows: list[dict] = []
    for qc in passing:
        cr = pd.read_parquet(require(processed / "scores" / f"{qc}__main__compound_ranking.parquet"))
        results = top5_rule(cr, candidate_ids)
        platform, region = COHORT_META.get(qc, ("RNA-seq", "unspecified"))
        rows += _query_rows(
            candidate_ids, qc, "held_out_cohort", f"{qc} (held-out cohort)",
            results, {str(r.pert_id): float(r.consensus_median) for r in cr.itertuples()},
            platform=platform, region=region,
        )
    adj = pd.read_parquet(require(processed / "scores" / f"{ADJUSTED_QUERY}__compound_ranking.parquet"))
    adj_results = top5_rule(adj, candidate_ids)
    platform, region = COHORT_META[ADJUSTED_QUERY]
    rows += _query_rows(
        candidate_ids, ADJUSTED_QUERY, "composition_adjusted", "GSE132903 composition-adjusted",
        adj_results, {str(r.pert_id): float(r.consensus_median) for r in adj.itertuples()},
        platform=platform, region=region,
    )
    held = ctx_scores[ctx_scores["split"] == "held_out"]
    held_by = {cid: held[held["pert_id"].astype(str) == cid] for cid in candidate_ids}
    rows += _lincs_rows(held_by, theta, seed=seed)
    exposure_path = processed / "evidence" / "exposure.parquet"
    exposure_included = exposure_path.exists()
    if exposure_included:
        rows += _exposure_rows(candidate_ids, processed)
    df = pd.DataFrame(rows, columns=TRUTH_TABLE_COLUMNS)
    type_counts = df.groupby("context_type").size().to_dict()
    params = {
        "ranking": ranking,
        "permctl": permctl,
        "theta": theta,
        "theta_source": f"scores/{permctl}__permutation_null sidecar (summary sidecar checked)",
        "max_lincs_contexts": MAX_LINCS_CONTEXTS,
        "random_seed": seed,
        "cohort_qc_gate": gate,
        "exposure_included": exposure_included,
        "cell_type": "skipped (stretch, no data)",
        "n_candidates": len(candidate_ids),
        "n_benchmark": sum(1 for p in pools.values() if p == "benchmark"),
        "n_development": sum(1 for p in pools.values() if p == "development"),
        "contexts_per_type": {str(k): int(v) for k, v in type_counts.items()},
    }
    return df, params


def write_truth_table(
    df: pd.DataFrame, out: Path, seed: int = SYNTHETIC_SEED, extra_params: dict | None = None
) -> Path:
    """Write truth_table.parquet plus its provenance sidecar."""
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    params = {"theta_source": "permctl_null_sidecar", "max_lincs_contexts": MAX_LINCS_CONTEXTS}
    params.update(extra_params or {})
    Provenance(
        step="truth_table",
        dataset_accession=["GSE132903", "GSE173955", "GSE53697", "LINCS-L1000", "ChEMBL"],
        parameters=params,
        random_seed=seed,
        validation_context="hidden_pool",
    ).write(out)
    return out


# ---------------------------------------------------------------------------
# Synthetic world (tests + dry-run benchmark; clearly labelled, never real)
#
# Design (see README): latent per-candidate robustness rho plus a per-candidate
# per-cell-line latent effect, so contexts sharing a cell line have correlated
# outcomes beyond rho. Hidden LINCS contexts sit in two 3-context blocks (same
# cell, varying dose/time) plus a singleton; same-cell similarity (>= 0.7)
# makes each block the decisive structure a smart policy probes first, while
# cross-type pairs (e.g. cohort vs adjusted) stay at 0.1 per the spec.
# Base rates and the rho distribution are calibrated so the full-information
# claim holds for 40-60% of candidates and >= 50% are contested (step-0
# verdict INSUFFICIENT_EVIDENCE).
# ---------------------------------------------------------------------------


@dataclass
class SyntheticCandidate:
    """One synthetic candidate: ranking observations + hidden contexts + truth."""

    candidate_id: str
    ranking: list[Observation] = field(default_factory=list)
    hidden: list[Context] = field(default_factory=list)
    truth: dict[str, bool] = field(default_factory=dict)
    values: dict[str, float] = field(default_factory=dict)
    thresholds: dict[str, float] = field(default_factory=dict)
    rules: dict[str, str] = field(default_factory=dict)


# Calibrated so claim-holds rate is 40-60% and the contested share is >= 50%
# (checked by tests/tauchstone/test_truth_table.py on a fixed seed).
_RHO_A = 2.0
_RHO_B = 1.6
_BASE_RATE = {
    "held_out_cohort": 0.68,
    "composition_adjusted": 0.68,
    "lincs_context": 0.66,
    "brain_exposure": 0.50,
}
_RHO_WEIGHT = 0.50
_BASE_WEIGHT = 0.30
_CELL_WEIGHT = 0.20
_EXPOSURE_PRESENT_P = 0.6


def _clip01(p: float) -> float:
    return max(0.05, min(0.95, p))


def _lincs_prob(rho: float, base: float, cell_effect: float) -> float:
    return _clip01(_RHO_WEIGHT * rho + _BASE_WEIGHT * base + _CELL_WEIGHT * cell_effect)


def _cohort_prob(rho: float, base: float) -> float:
    return _clip01(_RHO_WEIGHT * rho + (1.0 - _RHO_WEIGHT) * base)


_SYN_CELLS = ["MCF7", "A549", "VCAP"]
_SYN_DOSES = ["10 uM", "1 uM"]
_SYN_TIMES = ["24 h", "6 h"]


def make_synthetic_world(
    n_candidates: int = 100, seed: int = SYNTHETIC_SEED
) -> list[SyntheticCandidate]:
    """Synthetic candidates with correlated, exploitable hidden outcomes.

    Each candidate has latent robustness ``rho ~ Beta(_RHO_A, _RHO_B)`` and a
    per-cell-line latent effect ``Uniform(0, 1)``; a LINCS context's survive
    probability mixes rho, its type base rate, and the cell effect, so
    same-cell contexts are correlated beyond rho. Ranking observations carry
    the same cell effects, so similarity weighting can exploit the blocks.
    """
    rng = np.random.default_rng(seed)
    theta = -0.5
    world: list[SyntheticCandidate] = []
    for i in range(n_candidates):
        cid = f"BRD-SYN{i:04d}"
        rho = float(rng.beta(_RHO_A, _RHO_B))
        cell_latent = {c: float(rng.random()) for c in _SYN_CELLS}
        block_cells = list(rng.choice(_SYN_CELLS, size=2, replace=False))
        lone_cell = next(c for c in _SYN_CELLS if c not in block_cells)

        ranking: list[Observation] = []
        for k, cell in enumerate(block_cells + block_cells + [lone_cell]):
            dose = _SYN_DOSES[int(rng.integers(len(_SYN_DOSES)))]
            time = _SYN_TIMES[int(rng.integers(len(_SYN_TIMES)))]
            ctx = Context(
                context_id=f"{cell}|{dose}|{time}::rank{k}",
                type="lincs_context",
                label=f"{cell} {dose} {time} (ranking)",
                platform="L1000",
                cell_id=cell,
                pert_idose=dose,
                pert_itime=time,
            )
            cons = float(rng.normal(-1.4 * rho - 0.4 * (cell_latent[cell] - 0.5), 0.5))
            ranking.append(Observation(context=ctx, survive=cons <= theta, source="ranking"))

        hidden: list[Context] = []
        truth: dict[str, bool] = {}
        values: dict[str, float] = {}
        thresholds: dict[str, float] = {}
        rules: dict[str, str] = {}
        # Decisive pair: identical platform+region -> similarity 1.0.
        pair_cfgs = [
            ("GSE173955", "held_out_cohort", "GSE173955 (held-out cohort)", "RNA-seq", "hippocampus"),
            (
                "GSE132903__composition_adjusted",
                "composition_adjusted",
                "GSE132903 composition-adjusted",
                "RNA-seq",
                "hippocampus",
            ),
        ]
        for qid, ctype, label, plat, region in pair_cfgs:
            ctx = Context(context_id=qid, type=ctype, label=label, platform=plat, region=region)
            hidden.append(ctx)
            truth[qid] = bool(rng.random() < _cohort_prob(rho, _BASE_RATE["held_out_cohort"]))
            values[qid] = float(rng.normal(-1.0 if truth[qid] else 0.3, 0.4))
            rules[qid] = "compound in the 25% most-reversing ranked compounds for this query"
        k = 0
        for cell in block_cells:
            for _ in range(3):
                dose = _SYN_DOSES[int(rng.integers(len(_SYN_DOSES)))]
                time = _SYN_TIMES[int(rng.integers(len(_SYN_TIMES)))]
                qid = f"{cell}|{dose}|{time}::held{k}"
                k += 1
                ctx = Context(
                    context_id=qid,
                    type="lincs_context",
                    label=f"{cell} {dose} {time} (held-out)",
                    platform="L1000",
                    cell_id=cell,
                    pert_idose=dose,
                    pert_itime=time,
                )
                hidden.append(ctx)
                truth[qid] = bool(
                    rng.random() < _lincs_prob(rho, _BASE_RATE["lincs_context"], cell_latent[cell])
                )
                values[qid] = float(rng.normal(-1.2 * rho + 0.2, 0.5))
                thresholds[qid] = theta
                rules[qid] = "held-out LINCS context consensus <= theta"
        lone_dose = _SYN_DOSES[int(rng.integers(len(_SYN_DOSES)))]
        lone_time = _SYN_TIMES[int(rng.integers(len(_SYN_TIMES)))]
        lone_qid = f"{lone_cell}|{lone_dose}|{lone_time}::held{k}"
        lone_ctx = Context(
            context_id=lone_qid,
            type="lincs_context",
            label=f"{lone_cell} {lone_dose} {lone_time} (held-out)",
            platform="L1000",
            cell_id=lone_cell,
            pert_idose=lone_dose,
            pert_itime=lone_time,
        )
        hidden.append(lone_ctx)
        truth[lone_qid] = bool(
            rng.random() < _lincs_prob(rho, _BASE_RATE["lincs_context"], cell_latent[lone_cell])
        )
        values[lone_qid] = float(rng.normal(-1.2 * rho + 0.2, 0.5))
        thresholds[lone_qid] = theta
        rules[lone_qid] = "held-out LINCS context consensus <= theta"
        if rng.random() < _EXPOSURE_PRESENT_P:
            be = Context(
                context_id="brain_exposure", type="brain_exposure", label="measured brain exposure"
            )
            hidden.append(be)
            p_be = _clip01(
                _RHO_WEIGHT * rho + (1.0 - _RHO_WEIGHT) * _BASE_RATE["brain_exposure"]
            )
            truth["brain_exposure"] = bool(rng.random() < p_be)
            rules["brain_exposure"] = (
                "measured human CNS PK, or Kp >= 0.1, or PAMPA-BBB Pe >= 4e-6 cm/s; "
                "fail if measured below those"
            )
        world.append(
            SyntheticCandidate(
                candidate_id=cid,
                ranking=ranking,
                hidden=hidden,
                truth=truth,
                values=values,
                thresholds=thresholds,
                rules=rules,
            )
        )
    return world


def synthetic_truth_table(world: list[SyntheticCandidate]) -> pd.DataFrame:
    """Render a synthetic world as truth_table-shaped rows (labelled synthetic)."""
    rows = []
    for cand in world:
        for ctx in cand.hidden:
            rows.append(
                {
                    "candidate_id": cand.candidate_id,
                    "context_id": ctx.context_id,
                    "context_type": ctx.type,
                    "label": ctx.label + " [synthetic]",
                    "value": cand.values.get(ctx.context_id),
                    "threshold": cand.thresholds.get(ctx.context_id),
                    "outcome": "survive" if cand.truth[ctx.context_id] else "fail",
                    "rule": cand.rules.get(ctx.context_id, ""),
                    "tissue": ctx.tissue,
                    "region": ctx.region,
                    "platform": ctx.platform,
                    "cell_id": ctx.cell_id,
                    "pert_idose": ctx.pert_idose,
                    "pert_itime": ctx.pert_itime,
                }
            )
    return pd.DataFrame(rows, columns=TRUTH_TABLE_COLUMNS)


def prereg_guard() -> tuple[str, str]:
    """Refuse unless the preregistration is frozen AND committed with no local changes.

    Returns (sha256, commit) for the provenance record.
    """
    import subprocess

    prereg = MANIFESTS / "preregistration.yaml"
    text = prereg.read_text()
    import yaml

    status = (yaml.safe_load(text) or {}).get("status")
    if status != "frozen":
        raise SystemExit(
            f"refusing: {prereg} status is {status!r}, expected 'frozen'. "
            "Freeze the preregistration and commit it before running the benchmark."
        )
    repo = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=prereg.parent,
                               check=True, capture_output=True, text=True).stdout.strip())
    try:
        rel = str(prereg.relative_to(repo))
        subprocess.run(
            ["git", "diff", "--quiet", "--", rel],
            cwd=repo,
            check=True,
        )
        committed = (
            subprocess.run(
                ["git", "log", "--format=%H", "-1", "--", rel],
                cwd=repo,
                check=True,
                capture_output=True,
                text=True,
            )
            .stdout.strip()
            .splitlines()
        )
        if not committed:
            raise SystemExit(f"refusing: {rel} has never been committed.")
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=repo, check=True, capture_output=True, text=True
        ).stdout.strip()
        if committed[0] != head:
            # The file was committed but changed since: diff --quiet above only
            # catches unstaged/worktree changes vs index; also require HEAD match.
            blob_at_head = subprocess.run(
                ["git", "show", f"HEAD:{rel}"],
                cwd=repo,
                check=True,
                capture_output=True,
            ).stdout
            if hashlib.sha256(blob_at_head).hexdigest() != hashlib.sha256(text.encode()).hexdigest():
                raise SystemExit(
                    f"refusing: {rel} differs from its committed version; commit the frozen file first."
                )
    except FileNotFoundError as e:
        raise SystemExit(f"refusing: git not available ({e}); cannot verify preregistration hash.") from e
    except subprocess.CalledProcessError as e:
        raise SystemExit(
            f"refusing: {prereg} has uncommitted changes; commit the frozen file first."
        ) from e
    return hashlib.sha256(text.encode()).hexdigest(), subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo, check=True, capture_output=True, text=True
    ).stdout.strip()


def main(argv: list[str] | None = None) -> Path:
    """CLI for `make truth-table`: build from upstream tables (guarded by their presence)."""
    ap = argparse.ArgumentParser(description="Build tauchstone/truth_table.parquet")
    ap.add_argument("--out", default=None, help="output parquet path")
    ap.add_argument("--processed", default=str(PROCESSED))
    ap.add_argument("--ranking", default=PRIMARY_QUERY, help="ranking query name (re-runs if it changes)")
    ap.add_argument(
        "--permctl", default=None,
        help="permutation-control run name (default: prereg ranking.permutation_control_run)",
    )
    ap.add_argument("--seed", type=int, default=SYNTHETIC_SEED)
    args = ap.parse_args(argv)
    out = Path(args.out) if args.out else Path(args.processed) / "tauchstone" / "truth_table.parquet"
    df, params = build_truth_table(Path(args.processed), ranking=args.ranking, permctl=args.permctl, seed=args.seed)
    write_truth_table(df, out, seed=args.seed, extra_params=params)
    # Integrity: counts per type only; never outcome statistics (benchmark pool unseen).
    print(f"wrote {out} ({len(df)} rows, {df['candidate_id'].nunique()} candidates)")
    print(f"theta={params['theta']:.4f} exposure_included={params['exposure_included']}")
    print(f"cohort gate: {params['cohort_qc_gate']}")
    print(f"contexts per type: {params['contexts_per_type']}")
    print(f"candidates: benchmark={params['n_benchmark']} development={params['n_development']}")
    return out


if __name__ == "__main__":
    main()
