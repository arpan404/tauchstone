"""Approval status from the drug map (OT maximumClinicalStage)."""

from __future__ import annotations

import argparse

import pandas as pd

from pipelines.common.paths import PROCESSED, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import chembl_card_url

# status, numeric max_phase (null where the spec defines none)
STAGE_MAP = {
    "APPROVAL": ("approved", 4.0),
    "PREAPPROVAL": ("investigational", None),
    "PHASE_3": ("investigational", 3.0),
    "PHASE_2_3": ("investigational", 2.5),
    "PHASE_2": ("investigational", 2.0),
    "PHASE_1_2": ("investigational", 1.5),
    "PHASE_1": ("investigational", 1.0),
    "EARLY_PHASE_1": ("preclinical", 0.5),
    "IND": ("preclinical", None),
    "PRECLINICAL": ("preclinical", None),
}


def map_stage(stage: str | None) -> tuple[str, float | None]:
    return STAGE_MAP.get(stage or "", ("unknown", None))


def build_approval(drug_map: pd.DataFrame) -> pd.DataFrame:
    out = drug_map[["pert_id", "chembl_id", "max_clinical_stage"]].drop_duplicates().copy()
    mapped = out["max_clinical_stage"].map(map_stage)
    out["status"] = [s for s, _ in mapped]
    out["max_phase"] = [p for _, p in mapped]
    out["source_url"] = out["chembl_id"].map(
        lambda c: chembl_card_url(c) if isinstance(c, str) else None)
    return out[["pert_id", "chembl_id", "max_phase", "status", "source_url"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    args = ap.parse_args()

    drug_map = pd.read_parquet(PROCESSED / "evidence" / "drug_map.parquet")
    approval = build_approval(drug_map)
    out_path = processed("evidence", "approval.parquet")
    approval.to_parquet(out_path, index=False)
    Provenance(
        step="approval",
        dataset_accession=["OpenTargets-26.09"],
        inputs={},
        gene_mapping_version="n/a",
        parameters={"ranking": args.ranking, "stage_map": {k: list(v) for k, v in STAGE_MAP.items()},
                    "status_counts": approval["status"].value_counts().to_dict()},
    ).write(out_path)
    print(approval["status"].value_counts().to_dict())


if __name__ == "__main__":
    main()
