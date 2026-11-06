"""One 3D structure per target (SIFTS + PDB metadata), mmCIF cached locally.

Selection order per UniProt accession: prefer X-ray or EM entries (pdb_entry_type)
of protein type, then smallest resolution (resolu.idx; -1.00 ignored), then largest
UniProt coverage (sum of SP_END-SP_BEG+1 over chains), then lower pdb_id.
Structures are target context only, never binding evidence.
"""

from __future__ import annotations

import argparse
import time
import urllib.request
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import raw_inputs

PDB_DIR = RAW / "evidence" / "pdb"
STRUCT_DIR = PROCESSED / "evidence" / "structures"
METHOD_MAP = {"diffraction": "X-ray", "EM": "EM", "NMR": "NMR", "other": "other"}
MAX_FILES = 400


def load_sifts() -> pd.DataFrame:
    df = pd.read_csv(PDB_DIR / "pdb_chain_uniprot.tsv.gz", sep="\t", comment="#",
                     dtype={"PDB": str, "CHAIN": str, "SP_PRIMARY": str},
                     usecols=["PDB", "CHAIN", "SP_PRIMARY", "SP_BEG", "SP_END"])
    df["pdb_id"] = df["PDB"].str.upper()
    return df


def load_entry_types() -> pd.DataFrame:
    rows = []
    with open(PDB_DIR / "pdb_entry_type.txt") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 3:
                rows.append({"pdb_id": parts[0].upper(), "mol_type": parts[1],
                             "method_raw": parts[2]})
    df = pd.DataFrame(rows).drop_duplicates("pdb_id")
    df["method"] = df["method_raw"].map(METHOD_MAP).fillna(df["method_raw"])
    return df


def load_resolution() -> dict[str, float]:
    res: dict[str, float] = {}
    with open(PDB_DIR / "resolu.idx") as f:
        for line in f:
            parts = line.split(";")
            if len(parts) == 3:
                try:
                    res[parts[0].strip().upper()] = float(parts[2].strip())
                except ValueError:
                    continue
    return res


def select_structures(sifts: pd.DataFrame, entry_types: pd.DataFrame,
                      resolution: dict[str, float], uniprots: list[str]) -> pd.DataFrame:
    """Best PDB per UniProt accession per the specified order."""
    cov = (sifts.assign(span=sifts["SP_END"] - sifts["SP_BEG"] + 1)
           .groupby(["SP_PRIMARY", "pdb_id"], as_index=False)["span"].sum())
    cov = cov[cov["SP_PRIMARY"].isin(uniprots)]
    sel = cov.merge(entry_types, on="pdb_id", how="left")
    sel["method"] = sel["method"].fillna("unspecified")
    sel["mol_type"] = sel["mol_type"].fillna("unspecified")
    sel["resolution_angstrom"] = sel["pdb_id"].map(resolution)
    sel["res_sort"] = sel["resolution_angstrom"].where(
        (sel["resolution_angstrom"].notna()) & (sel["resolution_angstrom"] > 0), float("inf"))
    sel["method_rank"] = (~sel["method"].isin(["X-ray", "EM"])).astype(int)
    sel["type_rank"] = (sel["mol_type"] != "prot").astype(int)
    sel = sel.sort_values(["SP_PRIMARY", "method_rank", "type_rank", "res_sort",
                           "span", "pdb_id"],
                          ascending=[True, True, True, True, False, True])
    best = sel.drop_duplicates("SP_PRIMARY")
    return best.rename(columns={"SP_PRIMARY": "uniprot"})[
        ["uniprot", "pdb_id", "method", "resolution_angstrom"]].reset_index(drop=True)


def download_cif(pdb_id: str, dest_dir: Path, retries: int = 3) -> Path | None:
    dest = dest_dir / f"{pdb_id}.cif"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    url = f"https://files.rcsb.org/download/{pdb_id}.cif"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "tauchstone-ws4/0.1"})
            with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as f:
                f.write(resp.read())
            if dest.stat().st_size == 0:
                dest.unlink(missing_ok=True)
                raise OSError("empty file")
            return dest
        except Exception:
            if attempt == retries - 1:
                return None
            time.sleep(2 ** attempt)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()

    pool = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__candidate_pool.parquet")
    pool100 = set(pool[pool["pool"].isin(["benchmark", "development"])]["pert_id"])
    targets = pd.read_parquet(PROCESSED / "evidence" / "targets.parquet")
    uniprots = sorted(targets[targets["pert_id"].isin(pool100)]["uniprot"].dropna().unique())

    sel = select_structures(load_sifts(), load_entry_types(), load_resolution(), uniprots)
    STRUCT_DIR.mkdir(parents=True, exist_ok=True)
    local_paths, downloaded, failed = [], 0, []
    if not args.no_download:
        for rec in sel.head(MAX_FILES).itertuples():
            time.sleep(0.3)  # polite sequential fetch
            dest = download_cif(rec.pdb_id, STRUCT_DIR)
            if dest is None:
                failed.append(rec.pdb_id)
                local_paths.append(None)
            else:
                downloaded += 1
                local_paths.append(f"structures/{dest.name}")
    else:
        local_paths = [None] * len(sel)
    sel["local_path"] = (local_paths + [None] * (len(sel) - len(local_paths)))[:len(sel)]

    out_path = processed("evidence", "structures.parquet")
    sel.to_parquet(out_path, index=False)
    Provenance(
        step="structures",
        dataset_accession=["PDB-SIFTS"],
        inputs=raw_inputs(PDB_DIR / "pdb_chain_uniprot.tsv.gz",
                          PDB_DIR / "pdb_entry_type.txt", PDB_DIR / "resolu.idx"),
        gene_mapping_version="n/a",
        parameters={"ranking": args.ranking, "scope": "targets of pool ranks 1-100",
                    "order": ["X-ray/EM first", "protein type", "smallest resolution",
                              "largest UniProt coverage", "lower pdb_id"],
                    "cap": MAX_FILES, "downloaded": downloaded, "failed": failed,
                    "note": "Target context only. Not evidence that the drug binds this structure."},
    ).write(out_path)
    print({"targets": len(uniprots), "structures": len(sel), "downloaded": downloaded,
           "failed": failed})


if __name__ == "__main__":
    main()
