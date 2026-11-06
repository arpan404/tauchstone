"""HPA brain expression for the evidence targets.

Regions: rna_brain_region_hpa (already one value per main brain region; grouped by
(Gene, Brain region) with max nTPM, stated here — the file is unique on that key so
the aggregation is a no-op safety net).
Cell types: rna_single_cell_type, keeping the six CNS labels present in the file
(astrocytes, microglia, oligodendrocytes, oligodendrocyte progenitor cells,
brain excitatory neurons, brain inhibitory neurons) mapped to the display contexts
below. HPA Ensembl ids (ENSG) -> Entrez via the OT/Swiss-Prot chain in
targets.parquet.
"""

from __future__ import annotations

import argparse

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import hpa_brain_url, raw_inputs

HPA_DIR = RAW / "evidence" / "hpa"

CELL_CONTEXTS = {
    "astrocytes": "astrocytes",
    "microglia": "microglia",
    "oligodendrocytes": "oligodendrocytes",
    "oligodendrocyte progenitor cells": "oligodendrocyte progenitor cells",
    "brain excitatory neurons": "excitatory neurons",
    "brain inhibitory neurons": "inhibitory neurons",
}


def load_regions(path=None) -> pd.DataFrame:
    df = pd.read_csv(path or HPA_DIR / "rna_brain_region_hpa.tsv.zip", sep="\t",
                     usecols=["Gene", "Brain region", "nTPM"])
    df = df.rename(columns={"Gene": "ensembl_id", "Brain region": "context", "nTPM": "ntpm"})
    # one value per main region; max is a no-op guard if already unique
    return df.groupby(["ensembl_id", "context"], as_index=False)["ntpm"].max()


def load_cell_types(path=None) -> pd.DataFrame:
    df = pd.read_csv(path or HPA_DIR / "rna_single_cell_type.tsv.zip", sep="\t",
                     usecols=["Gene", "Cell type", "nCPM"])
    df = df[df["Cell type"].isin(CELL_CONTEXTS)].copy()
    df["context"] = df["Cell type"].map(CELL_CONTEXTS)
    df = df.rename(columns={"Gene": "ensembl_id", "nCPM": "ntpm"})
    return df.groupby(["ensembl_id", "context"], as_index=False)["ntpm"].max()


def build_brain_expression(targets: pd.DataFrame, regions=None, cells=None) -> pd.DataFrame:
    entrez = targets.drop_duplicates("ensembl_id").set_index("ensembl_id")["entrez_id"]
    regions = load_regions() if regions is None else regions
    regions = regions.assign(kind="region")
    cells = load_cell_types() if cells is None else cells
    cells = cells.assign(kind="cell_type")
    out = pd.concat([regions, cells], ignore_index=True)
    out["entrez_id"] = out["ensembl_id"].map(entrez)
    out = out[out["entrez_id"].notna()].copy()
    out["source_url"] = out["ensembl_id"].map(hpa_brain_url)
    return out[["entrez_id", "context", "kind", "ntpm", "source_url"]].reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    args = ap.parse_args()

    targets = pd.read_parquet(PROCESSED / "evidence" / "targets.parquet")
    brain = build_brain_expression(targets)
    out_path = processed("evidence", "brain_expression.parquet")
    brain.to_parquet(out_path, index=False)
    Provenance(
        step="brain_expression",
        dataset_accession=["HPA-25"],
        inputs=raw_inputs(HPA_DIR / "rna_brain_region_hpa.tsv.zip",
                          HPA_DIR / "rna_single_cell_type.tsv.zip"),
        gene_mapping_version="HPA ENSG -> Entrez via targets.parquet (OT/UniProt chain)",
        parameters={"ranking": args.ranking,
                    "region_aggregation": "max nTPM per (Gene, Brain region)",
                    "cell_labels_kept": sorted(CELL_CONTEXTS),
                    "cell_context_map": CELL_CONTEXTS,
                    "region_value": "nTPM", "cell_value": "nCPM (stored in ntpm column)",
                    "n_entrez": int(brain["entrez_id"].nunique()), "rows": len(brain)},
    ).write(out_path)
    print({"rows": len(brain), "genes": int(brain["entrez_id"].nunique()),
           "regions": sorted(brain[brain.kind == "region"]["context"].unique().tolist()),
           "cells": sorted(brain[brain.kind == "cell_type"]["context"].unique().tolist())})


if __name__ == "__main__":
    main()
