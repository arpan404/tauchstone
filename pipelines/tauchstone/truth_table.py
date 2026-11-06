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

#: Held-out cohort queries backing the top-5% survive rule.
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


def load_theta(processed: Path = PROCESSED) -> float:
    """Theta: 5th percentile of the pooled ranking-context null, from provenance.

    The value lives in the provenance sidecar of the primary permutation
    summary (the permutation pipeline records it there); falls back to the
    summary table itself if the sidecar lacks it.
    """
    summary = require(processed / "scores" / f"{PRIMARY_QUERY}__permutation_summary.parquet")
    sidecar = summary.with_name(summary.name + ".provenance.json")
    if sidecar.exists():
        params = json.loads(sidecar.read_text()).get("parameters", {})
        for key in ("theta", "theta_p05", "null_p05"):
            if key in params:
                return float(params[key])
    df = pd.read_parquet(summary)
    if "theta" in df.columns:
        return float(df["theta"].iloc[0])
    raise KeyError(
        f"theta not found: neither {sidecar} parameters nor a 'theta' column in {summary}"
    )


def _heldout_cohort_ids() -> list[str]:
    """Held-out cohort ids from the preregistration (GSE53697 already delisted there)."""
    import yaml

    prereg = yaml.safe_load((MANIFESTS / "preregistration.yaml").read_text())
    return [v["id"] for v in prereg.get("validation_contexts", []) if v.get("type") == "held_out_cohort"]


def cohort_qc(processed: Path, cohort_id: str, min_genes: int = 100) -> tuple[bool, int]:
    """Cohort QC gate: the cohort's own signature needs >= ``min_genes`` genes at FDR < 0.05.

    Returns (passes, n_fdr05). Raises ``FileNotFoundError`` naming a missing signature.
    """
    sig = require(processed / "signatures" / f"{cohort_id}__main.parquet")
    df = pd.read_parquet(sig, columns=["fdr"])
    n = int((df["fdr"] < 0.05).sum())
    return n >= min_genes, n


def gated_cohorts(
    processed: Path, cohort_ids: list[str], min_genes: int = 100
) -> tuple[list[str], dict[str, dict]]:
    """Split held-out cohorts into included vs QC-excluded, with a loggable gate record."""
    kept: list[str] = []
    gate: dict[str, dict] = {}
    for cid in cohort_ids:
        ok, n = cohort_qc(processed, cid, min_genes)
        gate[cid] = {"n_fdr05": n, "included": ok}
        if ok:
            kept.append(cid)
    return kept, gate


def top5_percent_ids(compound_ranking: pd.DataFrame) -> set[str]:
    """Pert_ids in the 5% most-reversing ranked compounds (rank 1 = most negative)."""
    if compound_ranking.empty:
        return set()
    ranked = compound_ranking.sort_values("consensus_median")
    n = max(1, int(np.ceil(0.05 * len(ranked))))
    return set(ranked["pert_id"].iloc[:n].astype(str))


def _cohort_rows(
    candidate_ids: list[str],
    query: str,
    context_type: str,
    label: str,
    processed: Path,
    region: str | None = None,
    platform: str | None = None,
) -> list[dict]:
    ranking_path = require(processed / "scores" / f"{query}__compound_ranking.parquet")
    ranking = pd.read_parquet(ranking_path)
    survivors = top5_percent_ids(ranking)
    by_id = {str(r.pert_id): r for r in ranking.itertuples()}
    rows = []
    for cid in candidate_ids:
        row = by_id.get(cid)
        rows.append(
            {
                "candidate_id": cid,
                "context_id": query,
                "context_type": context_type,
                "label": label,
                "value": None if row is None else float(row.consensus_median),
                "threshold": None,  # rank-based rule: no scalar threshold
                "outcome": "survive" if cid in survivors else "fail",
                "rule": "compound in the 5% most-reversing ranked compounds for this query",
                "tissue": "middle temporal gyrus" if context_type != "composition_adjusted" else None,
                "region": region,
                "platform": platform,
                "cell_id": None,
                "pert_idose": None,
                "pert_itime": None,
            }
        )
    return rows


def _lincs_rows(
    candidate_ids: list[str],
    context_split: pd.DataFrame,
    context_scores: pd.DataFrame,
    theta: float,
    seed: int = SYNTHETIC_SEED,
) -> list[dict]:
    """Held-out LINCS contexts per candidate, consensus <= theta survives.

    Capped at 8 per candidate, stratified by cell line (round-robin over cell
    lines with a seeded shuffle), per the spec.
    """
    rng = np.random.default_rng(seed)
    held = context_split[context_split["split"] == "held_out"]
    scores = context_scores.set_index(["pert_id", "context_id"])["consensus"].to_dict()
    meta = (
        context_scores[["context_id", "cell_id", "pert_idose", "pert_itime"]]
        .drop_duplicates("context_id")
        .set_index("context_id")
        .to_dict("index")
    )
    rows = []
    for cid in candidate_ids:
        ctxs = sorted(held.loc[held["pert_id"] == cid, "context_id"].astype(str).unique())
        by_cell: dict[str, list[str]] = {}
        for c in ctxs:
            by_cell.setdefault(str(meta.get(c, {}).get("cell_id")), []).append(c)
        for cell_ctxs in by_cell.values():
            rng.shuffle(cell_ctxs)
        picked: list[str] = []
        while len(picked) < MAX_LINCS_CONTEXTS and any(by_cell.values()):
            for cell in sorted(by_cell):
                if by_cell[cell] and len(picked) < MAX_LINCS_CONTEXTS:
                    picked.append(by_cell[cell].pop(0))
        for c in sorted(picked):
            v = scores.get((cid, c))
            m = meta.get(c, {})
            rows.append(
                {
                    "candidate_id": cid,
                    "context_id": c,
                    "context_type": "lincs_context",
                    "label": str(c).replace("|", " · "),
                    "value": None if v is None else float(v),
                    "threshold": float(theta),
                    "outcome": "survive" if (v is not None and float(v) <= theta) else "fail",
                    "rule": "held-out LINCS context consensus <= theta",
                    "tissue": None,
                    "region": None,
                    "platform": "L1000",
                    "cell_id": None if m.get("cell_id") is None else str(m["cell_id"]),
                    "pert_idose": None if m.get("pert_idose") is None else str(m["pert_idose"]),
                    "pert_itime": None if m.get("pert_itime") is None else str(m["pert_itime"]),
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
                "rule": (
                    "measured human CNS PK, or Kp >= 0.1, or PAMPA-BBB Pe >= 4e-6 cm/s; "
                    "fail if measured below those"
                ),
                "tissue": None,
                "region": None,
                "platform": None,
                "cell_id": None,
                "pert_idose": None,
                "pert_itime": None,
            }
        )
    return rows


def build_truth_table(
    processed: Path = PROCESSED,
    ranking_name: str = PRIMARY_QUERY,
    n_top: int = 50,
    n_dev: int = 50,
    seed: int = SYNTHETIC_SEED,
) -> tuple[pd.DataFrame, dict]:
    """Build the full truth table from upstream processed tables.

    Returns (table, provenance parameters incl. the cohort-QC gate log).
    Raises ``FileNotFoundError`` naming the first missing upstream input.
    """
    ranking_path = require(processed / "scores" / f"{ranking_name}__compound_ranking.parquet")
    ranking = pd.read_parquet(ranking_path).sort_values("consensus_median")
    pool = ranking["pert_id"].astype(str).tolist()[: n_top + n_dev]
    candidate_ids = pool  # rows are identical for benchmark (top 50) and dev (51-100) pools
    theta = load_theta(processed)
    split = pd.read_parquet(require(processed / "lincs" / "context_split.parquet"))
    ctx_scores = pd.read_parquet(
        require(processed / "scores" / f"{ranking_name}__context_scores.parquet")
    )
    import yaml

    min_genes = int(
        yaml.safe_load((MANIFESTS / "preregistration.yaml").read_text()).get("cohort_qc_gate", {}).get(
            "min_fdr05_genes", 100
        )
    )
    cohorts, gate = gated_cohorts(processed, _heldout_cohort_ids(), min_genes=min_genes)
    rows: list[dict] = []
    for qc in cohorts:
        rows += _cohort_rows(candidate_ids, qc, "held_out_cohort", f"{qc} (held-out cohort)", processed)
    rows += _cohort_rows(
        candidate_ids,
        ADJUSTED_QUERY,
        "composition_adjusted",
        "GSE132903 composition-adjusted",
        processed,
    )
    rows += _lincs_rows(candidate_ids, split, ctx_scores, theta, seed=seed)
    rows += _exposure_rows(candidate_ids, processed)
    df = pd.DataFrame(rows, columns=TRUTH_TABLE_COLUMNS)
    params = {
        "theta_source": "permutation_summary",
        "max_lincs_contexts": 8,
        "cohort_qc_gate": {"min_fdr05_genes": min_genes, **gate},
    }
    return df, params


def write_truth_table(
    df: pd.DataFrame, out: Path, seed: int = SYNTHETIC_SEED, extra_params: dict | None = None
) -> Path:
    """Write truth_table.parquet plus its provenance sidecar."""
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)
    params = {"theta_source": "permutation_summary", "max_lincs_contexts": 8}
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
            rules[qid] = "compound in the 5% most-reversing ranked compounds for this query"
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
    status = None
    for line in text.splitlines():
        if line.startswith("status:"):
            status = line.split(":", 1)[1].strip()
    if status != "frozen":
        raise SystemExit(
            f"refusing: {prereg} status is {status!r}, expected 'frozen'. "
            "Freeze the preregistration and commit it before running the benchmark."
        )
    repo = prereg.parents[1]
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
    ap.add_argument("--n-top", type=int, default=50)
    ap.add_argument("--n-dev", type=int, default=50)
    ap.add_argument("--seed", type=int, default=SYNTHETIC_SEED)
    args = ap.parse_args(argv)
    out = Path(args.out) if args.out else Path(args.processed) / "tauchstone" / "truth_table.parquet"
    df, params = build_truth_table(Path(args.processed), n_top=args.n_top, n_dev=args.n_dev, seed=args.seed)
    write_truth_table(df, out, seed=args.seed, extra_params=params)
    print(f"wrote {out} ({len(df)} rows, {df['candidate_id'].nunique()} candidates)")
    return out


if __name__ == "__main__":
    main()
