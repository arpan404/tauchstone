"""Tiny processed/ tree for on-the-fly hidden tests (shared by builder and API tests).

BRD-ADHOC is ranked but not in the truth table; BRD-SEALED is in it; BRD-THIN has only
2 ranking contexts (not rankable, so no hidden tests).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ADHOC = "BRD-ADHOC"
SEALED = "BRD-SEALED"
THIN = "BRD-THIN"
NO_EXPOSURE = "BRD-NOEXP"

#: held-out contexts per cell line for BRD-ADHOC (12 total, cap is 8)
HELD_CELLS = {"A549": 6, "MCF7": 4, "PC3": 2}


def _ranking(order: list[str], n_ctx: dict[str, int] | None = None) -> pd.DataFrame:
    n_ctx = n_ctx or {}
    return pd.DataFrame([
        {"rank": i + 1, "pert_id": pid, "pert_iname": pid.lower(),
         "consensus_median": -2.0 + 0.25 * i, "consensus_q25": -2.1, "consensus_q75": -1.9,
         "consensus_iqr": 0.2, "n_ranking_contexts": n_ctx.get(pid, 4),
         "z_wtcs_median": -1.0, "z_ks_median": -1.0, "z_cosine_median": -1.0}
        for i, pid in enumerate(order)
    ])


def _write(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)


def make_processed(base: Path) -> Path:
    """Write the fixture tree under ``base`` and return it."""
    fillers = [f"BRD-F{i}" for i in range(4)]
    primary = [SEALED, ADHOC, NO_EXPOSURE, THIN, *fillers]
    _write(_ranking(primary, {THIN: 2}), base / "scores" / "GSE132903__main__compound_ranking.parquet")
    # GSE173955: ADHOC at rank 2 of 8 (cutoff ceil(0.25 * 8) = 2) -> survive
    _write(_ranking([SEALED, ADHOC, *fillers, NO_EXPOSURE, THIN]),
           base / "scores" / "GSE173955__main__compound_ranking.parquet")
    # composition-adjusted: ADHOC at rank 5 -> fail
    _write(_ranking([SEALED, *fillers, ADHOC, NO_EXPOSURE, THIN]),
           base / "scores" / "GSE132903__composition_adjusted__compound_ranking.parquet")

    ctx = []
    for pid in (ADHOC, NO_EXPOSURE, SEALED):
        for k, cons in enumerate((-1.5, -0.2, -2.0)):
            ctx.append({"pert_id": pid, "context_id": f"MCF7|{k} uM|24 h", "split": "ranking",
                        "cell_id": "MCF7", "pert_idose": f"{k} uM", "pert_itime": "24 h",
                        "consensus": cons, "z_wtcs": cons, "z_ks": cons, "z_cosine": cons})
    for cell, n in HELD_CELLS.items():
        for k in range(n):
            cons = -1.0 if k % 2 == 0 else 0.3  # theta (prereg) is about -0.664
            ctx.append({"pert_id": ADHOC, "context_id": f"{cell}|{k} uM|6 h", "split": "held_out",
                        "cell_id": cell, "pert_idose": f"{k} uM", "pert_itime": "6 h",
                        "consensus": cons, "z_wtcs": cons, "z_ks": cons, "z_cosine": cons})
    ctx.append({"pert_id": NO_EXPOSURE, "context_id": "VCAP|10 uM|24 h", "split": "held_out",
                "cell_id": "VCAP", "pert_idose": "10 uM", "pert_itime": "24 h",
                "consensus": -0.9, "z_wtcs": -0.9, "z_ks": -0.9, "z_cosine": -0.9})
    _write(pd.DataFrame(ctx), base / "scores" / "GSE132903__main__context_scores.parquet")

    _write(pd.DataFrame([
        {"pert_id": ADHOC, "level": "measured_preclinical", "measure": "kp", "value": 0.05,
         "unit": "ratio", "is_measured": True, "summary": "Kp 0.05", "source_url": "https://x"},
        {"pert_id": NO_EXPOSURE, "level": "predicted", "measure": "predicted_mpo", "value": 1.0,
         "unit": "binary", "is_measured": False, "summary": "predicted", "source_url": "https://x"},
    ]), base / "evidence" / "exposure.parquet")

    _write(pd.DataFrame([
        {"pool_rank": i + 1, "rank": i + 1, "pert_id": pid, "pert_iname": pid.lower(),
         "consensus_median": -2.0, "consensus_q25": -2.1, "consensus_q75": -1.9,
         "consensus_iqr": 0.2, "n_ranking_contexts": 4, "z_wtcs_median": -1.0,
         "z_ks_median": -1.0, "z_cosine_median": -1.0, "chembl_id": "CHEMBL1",
         "drug_name": pid.replace("BRD-", "").upper(), "max_clinical_stage": "APPROVAL",
         "stage_num": 9, "drug_type": "Small molecule", "parent_chembl_id": None,
         "match": "inchikey", "pool": "benchmark" if pid == SEALED else None, "is_demo": False}
        for i, pid in enumerate([SEALED, ADHOC, NO_EXPOSURE])
    ]), base / "scores" / "GSE132903__main__candidate_pool.parquet")

    _write(pd.DataFrame([
        {"candidate_id": SEALED, "context_id": "GSE173955", "context_type": "held_out_cohort",
         "label": "GSE173955 (held-out cohort)", "value": -1.234567, "threshold": None,
         "outcome": "survive", "rule": "top-25% rule", "tissue": None, "region": "hippocampus",
         "platform": "RNA-seq", "cell_id": None, "pert_idose": None, "pert_itime": None},
    ]), base / "tauchstone" / "truth_table.parquet")
    return base
