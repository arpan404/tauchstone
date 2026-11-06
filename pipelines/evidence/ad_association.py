"""Open Targets AD association for the evidence targets."""

from __future__ import annotations

import argparse
import json

import pandas as pd

from pipelines.common.paths import PROCESSED, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import AD_ID, OT_DIR, ot_evidence_url, raw_inputs


def load_ad_scores() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Overall + by-datatype association rows for AD (MONDO_0004975)."""
    overall_parts, datatype_parts = [], []
    for f in sorted((OT_DIR / "association_overall_indirect").glob("*.parquet")):
        d = pd.read_parquet(f)
        overall_parts.append(d[d["diseaseId"] == AD_ID][["targetId", "associationScore"]])
    for f in sorted((OT_DIR / "association_by_datatype_indirect").glob("*.parquet")):
        d = pd.read_parquet(f)
        datatype_parts.append(d[d["diseaseId"] == AD_ID][["targetId", "aggregationValue",
                                                          "associationScore"]])
    overall = (pd.concat(overall_parts, ignore_index=True).groupby("targetId", as_index=False)
               ["associationScore"].max())
    datatype = pd.concat(datatype_parts, ignore_index=True)
    return overall, datatype


def build_ad_association(ensembl_ids: pd.Series, overall: pd.DataFrame,
                         datatype: pd.DataFrame) -> pd.DataFrame:
    dt = (datatype.groupby("targetId")
          .apply(lambda g: json.dumps(dict(zip(g["aggregationValue"], g["associationScore"],
                                                 strict=True))),
                 include_groups=False))
    dt = dt.reset_index().rename(columns={0: "datatype_scores", "targetId": "ensembl_id"})
    out = pd.DataFrame({"ensembl_id": ensembl_ids.dropna().unique()})
    out = out.merge(overall.rename(columns={"targetId": "ensembl_id", "associationScore": "score"}),
                    on="ensembl_id", how="left")
    out = out.merge(dt, on="ensembl_id", how="left")
    out["source_url"] = out["ensembl_id"].map(ot_evidence_url)
    return out[["ensembl_id", "entrez_id", "score", "datatype_scores", "source_url"]] \
        if "entrez_id" in out.columns else out.assign(entrez_id=None) \
        [["ensembl_id", "entrez_id", "score", "datatype_scores", "source_url"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    args = ap.parse_args()

    targets = pd.read_parquet(PROCESSED / "evidence" / "targets.parquet")
    overall, datatype = load_ad_scores()
    assoc = build_ad_association(targets["ensembl_id"], overall, datatype)
    entrez = targets.drop_duplicates("ensembl_id").set_index("ensembl_id")["entrez_id"]
    assoc["entrez_id"] = assoc["ensembl_id"].map(entrez)
    assoc = assoc[["ensembl_id", "entrez_id", "score", "datatype_scores", "source_url"]]

    out_path = processed("evidence", "ad_association.parquet")
    assoc.to_parquet(out_path, index=False)
    Provenance(
        step="ad_association",
        dataset_accession=["OpenTargets-26.09"],
        inputs=raw_inputs(*sorted((OT_DIR / "association_overall_indirect").glob("*.parquet")),
                          *sorted((OT_DIR / "association_by_datatype_indirect").glob("*.parquet"))),
        gene_mapping_version="OT target id (Ensembl); Entrez carried from targets.parquet",
        parameters={"disease": AD_ID, "n_targets": len(assoc),
                    "n_with_score": int(assoc["score"].notna().sum()),
                    "ranking": args.ranking},
    ).write(out_path)
    print({"targets": len(assoc), "with_score": int(assoc["score"].notna().sum())})


if __name__ == "__main__":
    main()
