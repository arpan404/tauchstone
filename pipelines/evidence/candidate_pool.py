"""Map LINCS compounds to clinical drugs and build the Tauchstone candidate pool.

Spec: contracts/algorithms.md section 2, "Candidate pool".

- Match each LINCS compound to Open Targets 26.09 `drug_molecule` by full InChIKey, otherwise by
  the 14-character InChIKey connectivity block (salts, stereo variants), keeping the highest
  clinical stage on ties.
- Eligible: maximumClinicalStage at PHASE_1 or later.
- Pool ranks follow the compound ranking. Benchmark pool = eligible ranks 1-50, development pool =
  eligible ranks 51-100, demo candidates = eligible ranks 1, 5 and 12.

Usage: uv run python -m pipelines.evidence.candidate_pool --ranking GSE132903__main
"""

from __future__ import annotations

import argparse

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance, raw_checksum

OT_RELEASE = "26.09"
STAGE_ORDER = {
    "APPROVAL": 9, "PREAPPROVAL": 8, "PHASE_3": 7, "PHASE_2_3": 6, "PHASE_2": 5,
    "PHASE_1_2": 4, "PHASE_1": 3, "EARLY_PHASE_1": 2, "IND": 1, "PRECLINICAL": 0, "UNKNOWN": -1,
}
MIN_ELIGIBLE = STAGE_ORDER["PHASE_1"]
BENCHMARK_SIZE = 50
DEVELOPMENT_SIZE = 50
DEMO_POOL_RANKS = (1, 5, 12)


def load_drug_molecule() -> pd.DataFrame:
    files = sorted((RAW / "evidence" / "open_targets" / OT_RELEASE / "drug_molecule").glob("*.parquet"))
    if not files:
        raise FileNotFoundError("Open Targets drug_molecule not downloaded; run `make data`")
    cols = ["id", "name", "inchiKey", "maximumClinicalStage", "drugType", "parentId"]
    return pd.concat([pd.read_parquet(f, columns=cols) for f in files], ignore_index=True)


def map_compounds(compounds: pd.DataFrame, drugs: pd.DataFrame) -> pd.DataFrame:
    """One row per matched LINCS compound: pert_id, chembl_id, drug_name, stage, match."""
    c = compounds[compounds["inchi_key"].notna() & (compounds["inchi_key"] != "-666")].copy()
    m = drugs[drugs["inchiKey"].notna()].copy()
    m["stage_num"] = m["maximumClinicalStage"].map(STAGE_ORDER).fillna(-1).astype(int)
    m = m.sort_values(["stage_num", "id"], ascending=[False, True])
    keep = ["id", "name", "maximumClinicalStage", "stage_num", "drugType", "parentId"]

    full = c.merge(m.drop_duplicates("inchiKey")[["inchiKey", *keep]],
                   left_on="inchi_key", right_on="inchiKey")
    c["k14"] = c["inchi_key"].str[:14]
    m["k14"] = m["inchiKey"].str[:14]
    part = c[~c["pert_id"].isin(full["pert_id"])].merge(
        m.drop_duplicates("k14")[["k14", *keep]], on="k14")

    out = pd.concat([full.assign(match="inchikey"), part.assign(match="connectivity")],
                    ignore_index=True)
    out = out.rename(columns={"id": "chembl_id", "name": "drug_name",
                              "maximumClinicalStage": "max_clinical_stage", "drugType": "drug_type",
                              "parentId": "parent_chembl_id"})
    cols = ["pert_id", "chembl_id", "drug_name", "max_clinical_stage", "stage_num",
            "drug_type", "parent_chembl_id", "match"]
    return out[cols].drop_duplicates("pert_id").reset_index(drop=True)


def build_pool(ranking: pd.DataFrame, drug_map: pd.DataFrame) -> pd.DataFrame:
    """Eligible ranked compounds in ranking order, with pool assignments."""
    r = ranking.merge(drug_map, on="pert_id", how="inner")
    r = r[r["stage_num"] >= MIN_ELIGIBLE].sort_values("rank").reset_index(drop=True)
    r.insert(0, "pool_rank", r.index + 1)
    r["pool"] = None
    r.loc[r["pool_rank"] <= BENCHMARK_SIZE, "pool"] = "benchmark"
    dev = (r["pool_rank"] > BENCHMARK_SIZE) & (r["pool_rank"] <= BENCHMARK_SIZE + DEVELOPMENT_SIZE)
    r.loc[dev, "pool"] = "development"
    r["is_demo"] = r["pool_rank"].isin(DEMO_POOL_RANKS)
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main", help="scores/{name}__compound_ranking.parquet")
    args = ap.parse_args()

    compounds = pd.read_parquet(PROCESSED / "lincs" / "compounds.parquet")
    drug_map = map_compounds(compounds, load_drug_molecule())
    map_path = processed("evidence", "drug_map.parquet")
    drug_map.to_parquet(map_path, index=False)
    dm_files = sorted((RAW / "evidence" / "open_targets" / OT_RELEASE / "drug_molecule").glob("*.parquet"))
    inputs = {f"evidence/open_targets/{OT_RELEASE}/drug_molecule/{f.name}":
              raw_checksum(f"evidence/open_targets/{OT_RELEASE}/drug_molecule/{f.name}") for f in dm_files}
    Provenance(step="drug_map", dataset_accession=["GSE92742", "GSE70138", f"OpenTargets-{OT_RELEASE}"],
               inputs=inputs, gene_mapping_version="n/a",
               parameters={"match": ["inchikey", "inchikey_connectivity14"], "tie": "highest stage, then chembl id",
                           "n_matched": len(drug_map),
                           "by_match": drug_map["match"].value_counts().to_dict()}).write(map_path)

    ranking = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__compound_ranking.parquet")
    pool = build_pool(ranking, drug_map)
    pool_path = processed("scores", f"{args.ranking}__candidate_pool.parquet")
    pool.to_parquet(pool_path, index=False)
    Provenance(step="candidate_pool", dataset_accession=["GSE132903", "GSE92742", "GSE70138",
                                                          f"OpenTargets-{OT_RELEASE}"],
               inputs=inputs,
               parameters={"ranking": args.ranking, "min_stage": "PHASE_1",
                           "benchmark": f"pool ranks 1-{BENCHMARK_SIZE}",
                           "development": f"pool ranks {BENCHMARK_SIZE + 1}-{BENCHMARK_SIZE + DEVELOPMENT_SIZE}",
                           "demo_pool_ranks": list(DEMO_POOL_RANKS), "n_eligible": len(pool)}).write(pool_path)
    print({"matched": len(drug_map), "eligible_ranked": len(pool),
           "demo": pool.loc[pool["is_demo"], ["pool_rank", "pert_iname", "max_clinical_stage"]].to_dict("records")})


if __name__ == "__main__":
    main()
