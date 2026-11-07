"""Per-drug evidence-gap table for the MVP (Track D1).

One row per ranked compound in scores/GSE132903__main__compound_ranking.parquet,
derived from RANKING contexts only (split == 'ranking'; held-out rows are never
read for values). Held-out contexts and measured exposure values are hidden
tests and must not leak into this table.

Columns of evidence/gaps.parquet:
  pert_id, brain_cells_json, cancer_lines_only, doses_um, times_h,
  exposure_level, exposure_label, measured_available, has_targets

brain_cells_json: JSON list of {cell_id, consensus, below_theta} for ranking
contexts in neural lines (median consensus per cell, vs theta from the
preregistration). cancer_lines_only: true iff no ranking context is in the
neural set. doses_um / times_h: sorted unique parsed values. exposure_* come
from the PREDICTED exposure row only; measured_available records whether a
measured row exists (the value itself is never exposed here). has_targets:
whether evidence/targets.parquet has a row for the drug.
"""

from __future__ import annotations

import argparse
import json
import math
import re

import pandas as pd
import yaml

from pipelines.common.paths import MANIFESTS, PROCESSED, processed
from pipelines.common.provenance import Provenance

NEURAL_CELLS = frozenset(
    {"SHSY5Y", "NEU", "NEU.KCL", "MNEU.E", "NPC", "NPC.CAS9", "NPC.TAK", "FIBRNPC"}
)

_FALLBACK_THETA = -0.6644132522302304

_DOSE_RE = re.compile(r"^\s*([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*([a-zA-Z]+)\s*$")
_TIME_RE = re.compile(r"^\s*([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)\s*([a-zA-Z]+)\s*$")

_DOSE_TO_UM = {"um": 1.0, "nm": 1e-3, "mm": 1e3, "m": 1e6, "pm": 1e-6}


def load_theta() -> float:
    """Reversal threshold from the frozen preregistration (never from held-out data)."""
    path = MANIFESTS / "preregistration.yaml"
    try:
        doc = yaml.safe_load(path.read_text())
        theta = doc["tauchstone_engine"]["theta_value"]
        return float(theta)
    except (OSError, KeyError, TypeError, ValueError):
        return _FALLBACK_THETA


def parse_dose_um(raw: object) -> float | None:
    """'10 uM' -> 10.0, '500 nM' -> 0.5. None for missing/unparseable."""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    m = _DOSE_RE.match(str(raw).replace("µ", "u").replace("μ", "u"))
    if not m:
        return None
    factor = _DOSE_TO_UM.get(m.group(2).lower())
    if factor is None:
        return None
    try:
        return float(m.group(1)) * factor
    except ValueError:
        return None


def parse_time_h(raw: object) -> float | None:
    """'24 h' -> 24.0, '30 min' -> 0.5. None for missing/unparseable."""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    m = _TIME_RE.match(str(raw))
    if not m:
        return None
    unit = m.group(2).lower()
    try:
        value = float(m.group(1))
    except ValueError:
        return None
    if unit in ("h", "hr", "hrs", "hour", "hours"):
        return value
    if unit in ("min", "mins", "minute", "minutes"):
        return value / 60.0
    if unit in ("d", "day", "days"):
        return value * 24.0
    return None


def derive_gaps(
    ranking: pd.DataFrame,
    context_ranking: pd.DataFrame,
    exposure: pd.DataFrame,
    targets: pd.DataFrame,
    theta: float,
) -> pd.DataFrame:
    """Build the gap table. All inputs are ranking-scope only (no held-out values)."""
    ctx = context_ranking[context_ranking["split"] == "ranking"].copy()
    ctx["pert_id"] = ctx["pert_id"].astype(str)
    ctx["cell_id"] = ctx["cell_id"].astype(str)

    measured_perts = set(
        exposure[exposure["level"].isin(["measured_human_cns", "measured_preclinical"])]["pert_id"].astype(str)
    )
    predicted_label: dict[str, tuple[str, str]] = {}
    for rec in exposure[exposure["level"] == "predicted"].itertuples():
        label = "predicted penetrant" if float(rec.value) >= 0.5 else "predicted low"
        predicted_label[str(rec.pert_id)] = ("predicted", label)
    target_perts = set(targets["pert_id"].astype(str)) if len(targets) else set()

    brain_med = (
        ctx[ctx["cell_id"].isin(NEURAL_CELLS)]
        .groupby(["pert_id", "cell_id"])["consensus"]
        .median()
    )

    rows = []
    for rec in ranking.itertuples():
        pid = str(rec.pert_id)
        g = ctx[ctx["pert_id"] == pid]
        cells = sorted(set(g["cell_id"].tolist()))
        brain_cells = []
        if pid in brain_med.index.get_level_values(0):
            sub = brain_med.loc[pid]
            for cell_id, med in sub.items():
                med = float(med)
                brain_cells.append(
                    {"cell_id": str(cell_id), "consensus": med, "below_theta": bool(med <= theta)}
                )
            brain_cells.sort(key=lambda b: b["cell_id"])
        doses = sorted({d for d in (parse_dose_um(v) for v in g["pert_idose"].tolist()) if d is not None})
        times = sorted({t for t in (parse_time_h(v) for v in g["pert_itime"].tolist()) if t is not None})
        level, label = predicted_label.get(pid, ("none", "no predicted data"))
        rows.append(
            {
                "pert_id": pid,
                "brain_cells_json": json.dumps(brain_cells),
                "cancer_lines_only": bool(cells and not (set(cells) & set(NEURAL_CELLS))),
                "doses_um": doses,
                "times_h": times,
                "exposure_level": level,
                "exposure_label": label,
                "measured_available": bool(pid in measured_perts),
                "has_targets": bool(pid in target_perts),
            }
        )
    return pd.DataFrame(
        rows,
        columns=[
            "pert_id",
            "brain_cells_json",
            "cancer_lines_only",
            "doses_um",
            "times_h",
            "exposure_level",
            "exposure_label",
            "measured_available",
            "has_targets",
        ],
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    args = ap.parse_args()

    theta = load_theta()
    ranking = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__compound_ranking.parquet")
    context = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__context_scores.parquet")
    exposure = pd.read_parquet(PROCESSED / "evidence" / "exposure.parquet")
    targets_path = PROCESSED / "evidence" / "targets.parquet"
    targets = pd.read_parquet(targets_path) if targets_path.exists() else pd.DataFrame(columns=["pert_id"])

    gaps = derive_gaps(ranking, context, exposure, targets, theta)
    out_path = processed("evidence", "gaps.parquet")
    gaps.to_parquet(out_path, index=False)
    Provenance(
        step="gaps",
        dataset_accession=["GSE132903", "GSE92742", "GSE70138"],
        inputs={},
        gene_mapping_version="n/a",
        parameters={
            "ranking": args.ranking,
            "scope": "ranking contexts only (split == 'ranking')",
            "neural_cells": sorted(NEURAL_CELLS),
            "theta": theta,
            "theta_source": "preregistration tauchstone_engine.theta_value",
            "n_drugs": len(gaps),
        },
        random_seed=None,
    ).write(out_path)
    print({"rows": len(gaps), "theta": theta})


if __name__ == "__main__":
    main()
