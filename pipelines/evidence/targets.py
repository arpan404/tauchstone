"""Drug targets from Open Targets mechanism-of-action + UniProt.

Spec (task WS4): OT drug_mechanism_of_action (explode chemblIds and targets; when the
matched molecule has a parent_chembl_id, also use the parent's mechanisms) joined to
OT target (Ensembl id -> approvedSymbol, proteinIds) and UniProt reviewed accessions
(Entrez GeneID). Prefer the reviewed Swiss-Prot accession.
"""

from __future__ import annotations

import argparse

import pandas as pd

from pipelines.common.paths import PROCESSED, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import OT_DIR, chembl_card_url, raw_inputs

MECH_DIR = OT_DIR / "drug_mechanism_of_action"
TARGET_DIR = OT_DIR / "target"


def load_mechanism() -> pd.DataFrame:
    files = sorted(MECH_DIR.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"OT mechanism-of-action not downloaded ({MECH_DIR})")
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def load_target_index() -> pd.DataFrame:
    """One row per Ensembl gene id: approvedSymbol + preferred reviewed accession."""
    files = sorted(TARGET_DIR.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"OT target not downloaded ({TARGET_DIR})")
    frames = [pd.read_parquet(f, columns=["id", "approvedSymbol", "proteinIds"]) for f in files]
    t = pd.concat(frames, ignore_index=True).drop_duplicates("id").reset_index(drop=True)
    t["uniprot"] = t["proteinIds"].map(prefer_swissprot)
    return t[["id", "approvedSymbol", "uniprot"]]


def prefer_swissprot(protein_ids) -> str | None:
    """Prefer the reviewed Swiss-Prot accession; fall back to any UniProt accession."""
    if protein_ids is None:
        return None
    ids = list(protein_ids)
    swiss = [d["id"] for d in ids if isinstance(d, dict) and d.get("source") == "uniprot_swissprot"]
    if swiss:
        return sorted(swiss)[0]
    uni = [d["id"] for d in ids
           if isinstance(d, dict) and str(d.get("source", "")).startswith("uniprot")]
    if uni:
        return sorted(uni)[0]
    return None


def load_uniprot() -> pd.DataFrame:
    """Reviewed human UniProt: Entry -> (primary gene name, Entrez GeneID).

    The 'Ensembl' column holds transcript ids (ENST...), not gene ids, so the join key
    is the accession itself (via OT proteinIds); Entrez comes from the GeneID column.
    """
    from pipelines.common.paths import RAW
    path = RAW / "evidence" / "uniprot" / "uniprot_human_swissprot.tsv.gz"
    u = pd.read_csv(path, sep="\t", usecols=["Entry", "Gene Names (primary)", "GeneID"],
                    dtype=str, keep_default_na=False)
    u["entrez_id"] = u["GeneID"].str.split(";").str[0].str.strip()
    u.loc[u["entrez_id"] == "", "entrez_id"] = None
    return u.rename(columns={"Entry": "uniprot",
                             "Gene Names (primary)": "uniprot_gene"})[["uniprot", "uniprot_gene", "entrez_id"]]


def explode_mechanism(moa: pd.DataFrame) -> pd.DataFrame:
    """One row per (chembl_id, ensembl target): explode both array columns."""
    rows = []
    for rec in moa.itertuples():
        chembls = list(rec.chemblIds) if rec.chemblIds is not None else []
        targets = list(rec.targets) if rec.targets is not None else []
        for c in chembls:
            for g in targets:
                rows.append({"moa_chembl_id": c, "ensembl_id": g,
                             "action_type": rec.actionType or None,
                             "mechanism": rec.mechanismOfAction or None,
                             "target_name": rec.targetName or None})
    out = pd.DataFrame(rows, columns=["moa_chembl_id", "ensembl_id", "action_type",
                                      "mechanism", "target_name"])
    return out.drop_duplicates().reset_index(drop=True)


def build_targets(drug_map: pd.DataFrame, moa_long: pd.DataFrame,
                  target_index: pd.DataFrame, uniprot: pd.DataFrame) -> pd.DataFrame:
    """Targets for every drug in drug_map (own + parent ChEMBL mechanisms)."""
    parent = drug_map.set_index("chembl_id")["parent_chembl_id"].to_dict()
    moa_by_chembl: dict[str, pd.DataFrame] = dict(tuple(moa_long.groupby("moa_chembl_id")))
    recs = []
    for rec in drug_map.itertuples():
        chembls = [rec.chembl_id]
        par = parent.get(rec.chembl_id)
        if isinstance(par, str) and par and par != rec.chembl_id:
            chembls.append(par)
        for c in chembls:
            m = moa_by_chembl.get(c)
            if m is None:
                continue
            for r in m.itertuples():
                recs.append({"pert_id": rec.pert_id, "chembl_id": rec.chembl_id,
                             "ensembl_id": r.ensembl_id, "action_type": r.action_type,
                             "mechanism": r.mechanism, "target_name": r.target_name})
    out = pd.DataFrame(recs, columns=["pert_id", "chembl_id", "ensembl_id", "action_type",
                                      "mechanism", "target_name"])
    if out.empty:
        out = out.assign(target_symbol=[], uniprot=[], entrez_id=[], source_url=[])
    else:
        out = out.drop_duplicates(["pert_id", "ensembl_id", "action_type", "mechanism"])
        out = out.merge(target_index.rename(columns={"id": "ensembl_id"}),
                        on="ensembl_id", how="left")
        out = out.merge(uniprot, on="uniprot", how="left")
        out["target_symbol"] = out["approvedSymbol"].fillna(out["target_name"])
        out["source_url"] = out["chembl_id"].map(chembl_card_url)
        out = out[["pert_id", "chembl_id", "target_symbol", "uniprot", "entrez_id",
                   "ensembl_id", "action_type", "mechanism", "source_url"]]
    return out.reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    args = ap.parse_args()

    from pipelines.common.paths import RAW
    drug_map = pd.read_parquet(PROCESSED / "evidence" / "drug_map.parquet")
    moa = load_mechanism()
    moa_long = explode_mechanism(moa)
    target_index = load_target_index()
    uniprot = load_uniprot()
    targets = build_targets(drug_map, moa_long, target_index, uniprot)

    out_path = processed("evidence", "targets.parquet")
    targets.to_parquet(out_path, index=False)
    n_drugs = int(targets["pert_id"].nunique())
    Provenance(
        step="targets",
        dataset_accession=["GSE92742", "GSE70138", "OpenTargets-26.09", "UniProt-SwissProt-human"],
        inputs=raw_inputs(*sorted(MECH_DIR.glob("*.parquet")),
                          *sorted(TARGET_DIR.glob("*.parquet")),
                          RAW / "evidence" / "uniprot" / "uniprot_human_swissprot.tsv.gz"),
        gene_mapping_version=("OT approvedSymbol + UniProt reviewed accession "
                                "(Swiss-Prot preferred); Entrez from UniProt GeneID"),
        parameters={"drugs": len(drug_map), "drugs_with_target": n_drugs,
                    "share_ge1_target": n_drugs / len(drug_map) if len(drug_map) else 0.0,
                    "parent_fallback": "parent_chembl_id mechanisms included",
                    "ranking": args.ranking},
    ).write(out_path)
    print({"drugs": len(drug_map), "with_target": n_drugs,
           "rows": len(targets),
           "share_ge1": round(n_drugs / len(drug_map), 4) if len(drug_map) else None})


if __name__ == "__main__":
    main()
