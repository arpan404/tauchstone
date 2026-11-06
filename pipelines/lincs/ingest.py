"""LINCS Level 5 ingest (WS3, Part A). Run: uv run python -m pipelines.lincs.ingest.

Reads both releases (GSE92742, GSE70138), keeps compound perturbations only
(pert_type == 'trt_cp'), harmonises metadata, and writes:
  processed/lincs/sig_info.parquet        trt_cp signature metadata + context_id + row
  processed/lincs/genes.parquet           entrez_id (string), symbol, is_landmark, is_bing
  processed/lincs/landmark_order.parquet  col -> entrez_id (matrix column order)
  processed/lincs/level5_landmark_f32.npy float32 (n_trt_cp, 978), rows = sig_info.row
  processed/lincs/compounds.parquet       per-compound metadata + counts
  processed/lincs/context_split.parquet   per-compound ranking|held_out split

Harmonisation choices (also recorded in provenance + final report):
* GSE70138 sig_info lacks numeric pert_dose/pert_time columns, so dose/time
  are parsed from the pert_idose/pert_itime strings in BOTH releases through
  one parser; this also merges cross-release contexts ('10 µM' == '10.0 um').
* Dose units are normalised to uM (nM values divided by 1000); time stays in h.
  Canonical strings look like '10 uM' / '24 h'. Unparseable entries (LINCS
  sentinel '-666') become pert_dose NaN / unit 'unspecified'.
* Neither release ships an is_gold column (only is_exemplar in GSE92742
  metrics), so sig_info has no is_gold column.
* Row order: all GSE92742 trt_cp rows (file order) then GSE70138 (file order).
* pert_info merge across releases: most frequent pert_iname; first
  non-sentinel canonical_smiles / inchi_key (GSE92742 preferred on ties).
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import RAW, processed
from pipelines.common.provenance import Provenance, raw_checksum
from pipelines.lincs import gctx
from pipelines.lincs.aggregate import SPLIT_SEED, make_context_split

R92742 = "GSE92742"
R70138 = "GSE70138"
LINCS_RAW = RAW / "lincs"

DOSE_RE = re.compile(r"^\s*([0-9eE+.\-]+)\s*([A-Za-zµμ]+)?\s*$")
UNIT_FIX = {"um": "uM", "µm": "uM", "μm": "uM", "µM": "uM", "uM": "uM", "UM": "uM",
            "nm": "nM", "nM": "nM", "NM": "nM"}


def parse_dose(s: str) -> tuple[float, str]:
    """Parse '10 uM'/'500 nM' -> (value_in_uM, 'uM'). Sentinel -> (nan, 'unspecified')."""
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return math.nan, "unspecified"
    s = str(s).strip()
    if s in ("-666", "", "-666.0"):
        return math.nan, "unspecified"
    m = DOSE_RE.match(s)
    if not m:
        return math.nan, "unspecified"
    try:
        val = float(m.group(1))
    except ValueError:
        return math.nan, "unspecified"
    unit = UNIT_FIX.get((m.group(2) or "").strip(), "unspecified")
    if unit == "unspecified":
        return math.nan, "unspecified"
    if unit == "nM":
        val = val / 1000.0
        unit = "uM"
    return val, unit


def parse_time(s: str) -> tuple[float, str]:
    """Parse '24 h' -> (24.0, 'h'). Sentinel -> (nan, 'unspecified')."""
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return math.nan, "unspecified"
    s = str(s).strip()
    if s in ("-666", "", "-666.0"):
        return math.nan, "unspecified"
    m = DOSE_RE.match(s)
    if not m:
        return math.nan, "unspecified"
    try:
        val = float(m.group(1))
    except ValueError:
        return math.nan, "unspecified"
    return val, (m.group(2) or "").strip() or "unspecified"


def canon_dose(val: float, unit: str) -> str:
    if unit == "unspecified" or not np.isfinite(val):
        return "unspecified"
    return f"{val:g} {unit}"


def canon_time(val: float, unit: str) -> str:
    if unit == "unspecified" or not np.isfinite(val):
        return "unspecified"
    return f"{val:g} {unit}"


def _raw_paths(release: str) -> dict[str, Path]:
    if release == R92742:
        d = LINCS_RAW / "GSE92742"
        return {
            "gctx": d / "GSE92742_Broad_LINCS_Level5_COMPZ.MODZ_n473647x12328.gctx",
            "sig_info": d / "GSE92742_Broad_LINCS_sig_info.txt.gz",
            "sig_metrics": d / "GSE92742_Broad_LINCS_sig_metrics.txt.gz",
            "gene_info": d / "GSE92742_Broad_LINCS_gene_info.txt.gz",
            "pert_info": d / "GSE92742_Broad_LINCS_pert_info.txt.gz",
        }
    d = LINCS_RAW / "GSE70138"
    return {
        "gctx": d / "GSE70138_Broad_LINCS_Level5_COMPZ_n118050x12328_2017-03-06.gctx",
        "sig_info": d / "GSE70138_Broad_LINCS_sig_info_2017-03-06.txt.gz",
        "sig_metrics": d / "GSE70138_Broad_LINCS_sig_metrics_2017-03-06.txt.gz",
        "gene_info": d / "GSE70138_Broad_LINCS_gene_info_2017-03-06.txt.gz",
        "pert_info": d / "GSE70138_Broad_LINCS_pert_info_2017-03-06.txt.gz",
    }


def load_sig_info(release: str) -> pd.DataFrame:
    p = _raw_paths(release)
    df = pd.read_csv(p["sig_info"], sep="\t", low_memory=False)
    df = df[df["pert_type"] == "trt_cp"].copy()
    if release == R92742:
        raw_idose = np.where(
            df["pert_dose_unit"].astype(str) == "-666",
            "-666",
            df["pert_dose"].astype(str) + " " + df["pert_dose_unit"].astype(str),
        )
        raw_itime = df["pert_time"].astype(str) + " " + df["pert_time_unit"].astype(str)
        df["_raw_idose"] = raw_idose
        df["_raw_itime"] = raw_itime
    else:
        df["_raw_idose"] = df["pert_idose"].astype(str)
        df["_raw_itime"] = df["pert_itime"].astype(str)
    parsed = df["_raw_idose"].map(parse_dose)
    df["pert_dose"] = [v for v, _ in parsed]
    df["pert_dose_unit"] = [u for _, u in parsed]
    parsed_t = df["_raw_itime"].map(parse_time)
    df["pert_time"] = [v for v, _ in parsed_t]
    df["pert_time_unit"] = [u for _, u in parsed_t]
    df["pert_idose"] = [canon_dose(v, u) for v, u in parsed]
    df["pert_itime"] = [canon_time(v, u) for v, u in parsed_t]
    df["source"] = release
    df["context_id"] = df["cell_id"].astype(str) + "|" + df["pert_idose"] + "|" + df["pert_itime"]
    keep = ["sig_id", "pert_id", "pert_iname", "cell_id", "pert_idose", "pert_itime",
            "pert_dose", "pert_dose_unit", "pert_time", "pert_time_unit", "source", "context_id"]
    out = df[keep].copy()
    out["pert_dose"] = pd.to_numeric(out["pert_dose"], errors="coerce").astype("float64")
    out["pert_time"] = pd.to_numeric(out["pert_time"], errors="coerce").astype("float64")
    return out.reset_index(drop=True)


def load_sig_metrics(release: str) -> pd.DataFrame:
    p = _raw_paths(release)
    df = pd.read_csv(p["sig_metrics"], sep="\t")
    df = df.drop(columns=[c for c in df.columns if c.startswith("Unnamed")], errors="ignore")
    return df[["sig_id", "distil_cc_q75", "pct_self_rank_q25", "distil_nsample"]].copy()


def main() -> dict:
    stats: dict = {"releases": {}}

    # ---- genes (identical set in both releases; verify) ----
    g1 = pd.read_csv(_raw_paths(R92742)["gene_info"], sep="\t")
    g2 = pd.read_csv(_raw_paths(R70138)["gene_info"], sep="\t")
    assert list(g1.columns) == list(g2.columns)
    assert set(g1["pr_gene_id"]) == set(g2["pr_gene_id"]), "gene sets differ between releases"
    genes = pd.DataFrame({
        "entrez_id": g1["pr_gene_id"].astype(int).astype(str),
        "symbol": g1["pr_gene_symbol"].astype(str),
        "is_landmark": g1["pr_is_lm"].astype(bool),
        "is_bing": g1["pr_is_bing"].astype(bool),
    })
    landmark = genes.loc[genes["is_landmark"]].sort_values(
        "entrez_id", key=lambda s: s.astype(int)).reset_index(drop=True)
    landmark_entrez = landmark["entrez_id"].tolist()
    assert len(landmark_entrez) == 978
    order = pd.DataFrame({"col": np.arange(len(landmark_entrez)), "entrez_id": landmark_entrez})

    genes_path = processed("lincs", "genes.parquet")
    genes.to_parquet(genes_path, index=False)
    lomap_path = processed("lincs", "landmark_order.parquet")
    order.to_parquet(lomap_path, index=False)
    stats["n_genes_total"] = len(genes)
    stats["n_landmark"] = len(landmark_entrez)
    stats["n_bing"] = int(genes["is_bing"].sum())

    # ---- sig metadata ----
    frames = []
    for rel in (R92742, R70138):
        si = load_sig_info(rel)
        sm = load_sig_metrics(rel)
        assert si["sig_id"].is_unique, f"dup sig_id in {rel}"
        merged = si.merge(sm, on="sig_id", how="left", validate="many_to_one")
        missing = int(merged["distil_cc_q75"].isna().sum())
        stats["releases"][rel] = {"n_trt_cp": len(si), "metrics_missing": missing,
                                  "dose_unspecified": int((si["pert_idose"] == "unspecified").sum())}
        frames.append(merged)
    sig_info = pd.concat(frames, ignore_index=True)
    assert sig_info["sig_id"].is_unique, "sig_id collision across releases"
    sig_info["row"] = np.arange(len(sig_info), dtype=np.int64)
    for frame in frames:
        frame["row"] = frame["sig_id"].map(dict(zip(sig_info["sig_id"], sig_info["row"], strict=True))).astype(np.int64)
    # nullable int for distil_nsample (a release could lack it -> all-null)
    sig_info["distil_nsample"] = sig_info["distil_nsample"].astype("Int64")
    sig_info = sig_info[["sig_id", "pert_id", "pert_iname", "cell_id", "pert_idose", "pert_itime",
                          "pert_dose", "pert_dose_unit", "pert_time", "pert_time_unit",
                          "distil_cc_q75", "pct_self_rank_q25", "distil_nsample",
                          "source", "context_id", "row"]]
    sig_path = processed("lincs", "sig_info.parquet")
    sig_info.to_parquet(sig_path, index=False)
    stats["n_trt_cp_total"] = len(sig_info)

    # ---- Level 5 landmark matrix ----
    n = len(sig_info)
    mat = np.empty((n, len(landmark_entrez)), dtype=np.float32)
    n_nan = 0
    for rel, frame in ((R92742, frames[0]), (R70138, frames[1])):
        keep = frame["sig_id"].tolist()
        keep_set = set(keep)
        row_of = dict(zip(frame["sig_id"], frame["row"], strict=True))
        gene_ids, _ = gctx.read_ids(_raw_paths(rel)["gctx"])
        assert set(gene_ids.tolist()) == set(genes["entrez_id"]), f"GCTX genes != gene_info in {rel}"
        n_filled = 0
        for sid_block, block in gctx.iter_blocks(_raw_paths(rel)["gctx"], genes=landmark_entrez,
                                                 block_size=10_000):
            sel = np.array([s in keep_set for s in sid_block])
            if not sel.any():
                continue
            dest = np.array([row_of[s] for s in sid_block[sel]])
            mat[dest] = block[sel]
            n_filled += int(sel.sum())
        assert n_filled == len(keep), f"{rel}: filled {n_filled} != {len(keep)}"
        n_nan += int(np.isnan(mat[frame['row'].to_numpy()]).sum())
    stats["matrix_nan"] = n_nan
    if n_nan:
        raise ValueError(f"{n_nan} NaN in Level5 landmark matrix; refusing to write")
    mat_path = processed("lincs", "level5_landmark_f32.npy")
    np.save(mat_path, mat)
    stats["matrix_shape"] = list(mat.shape)

    # ---- precomputed ranks (spec 1): order/rank int16, row-blocked ----
    order_path = processed("lincs", "order_i16.npy")
    rank_path = processed("lincs", "rank_i16.npy")
    order_mm = np.lib.format.open_memmap(order_path, mode="w+", dtype=np.int16,
                                         shape=(n, len(landmark_entrez)))
    rank_mm = np.lib.format.open_memmap(rank_path, mode="w+", dtype=np.int16,
                                        shape=(n, len(landmark_entrez)))
    blk = 50_000
    ar = np.arange(len(landmark_entrez))
    for start in range(0, n, blk):
        stop = min(start + blk, n)
        ob = np.argsort(-mat[start:stop], axis=1, kind="stable")
        order_mm[start:stop] = ob.astype(np.int16)
        rb = np.empty((stop - start, len(landmark_entrez)), dtype=np.int64)
        rb[np.arange(stop - start)[:, None], ob] = ar[None, :]
        rank_mm[start:stop] = rb.astype(np.int16)
        del ob, rb
    del order_mm, rank_mm
    stats["order_rank_dtype"] = "int16"

    # ---- compounds ----
    pi1 = pd.read_csv(_raw_paths(R92742)["pert_info"], sep="\t")
    pi2 = pd.read_csv(_raw_paths(R70138)["pert_info"], sep="\t")
    trt_cp_perts = set(sig_info["pert_id"])
    parts = []
    for pi, rel in ((pi1, R92742), (pi2, R70138)):
        sub = pi[pi["pert_id"].isin(trt_cp_perts)][["pert_id", "pert_iname",
                                                    "canonical_smiles", "inchi_key"]].copy()
        sub["source"] = rel
        parts.append(sub)
    pall = pd.concat(parts, ignore_index=True)
    for c in ["canonical_smiles", "inchi_key"]:
        pall[c] = pall[c].astype(str).mask(pall[c].astype(str).isin({"-666", "nan", "None"}))
    agg = pall.groupby("pert_id").agg(
        pert_iname=("pert_iname", lambda s: s.value_counts().index[0]),
        canonical_smiles=("canonical_smiles", lambda s: s.dropna().iloc[0] if s.notna().any() else None),
        inchi_key=("inchi_key", lambda s: s.dropna().iloc[0] if s.notna().any() else None),
    ).reset_index()
    counts = sig_info.groupby("pert_id").agg(n_signatures=("sig_id", "size"),
                                             n_contexts=("context_id", "nunique")).reset_index()
    compounds = agg.merge(counts, on="pert_id", validate="one_to_one")
    comp_path = processed("lincs", "compounds.parquet")
    compounds.to_parquet(comp_path, index=False)
    stats["n_compounds"] = len(compounds)

    # ---- context split ----
    split = make_context_split(sig_info, seed=SPLIT_SEED)
    split_path = processed("lincs", "context_split.parquet")
    split.to_parquet(split_path, index=False)
    stats["n_contexts"] = len(split)
    stats["n_held_out_contexts"] = int((split["split"] == "held_out").sum())

    # ---- provenance ----
    base_inputs = {f"lincs/{r}": raw_checksum(f"lincs/{r}") for r in ()}  # manifest keys TBD by WS1
    params = {"harmonisation": "dose->uM canonical idose/itime; see module docstring",
              "gene_space": "landmark_978", "matrix_dtype": "float32",
              "split_seed": SPLIT_SEED, "stats": stats}
    Provenance(step="lincs_ingest", dataset_accession=[R92742, R70138],
               inputs=base_inputs, parameters=params,
               random_seed=SPLIT_SEED).write(sig_path)
    Provenance(step="lincs_ingest_genes", dataset_accession=[R92742, R70138],
               parameters=params).write(genes_path)
    Provenance(step="lincs_ingest_landmark_order", dataset_accession=[R92742, R70138],
               parameters=params).write(lomap_path)
    Provenance(step="lincs_ingest_matrix", dataset_accession=[R92742, R70138],
               parameters=params).write(mat_path)
    Provenance(step="lincs_ingest_order_rank", dataset_accession=[R92742, R70138],
               parameters=params).write(order_path)
    Provenance(step="lincs_ingest_order_rank", dataset_accession=[R92742, R70138],
               parameters=params).write(rank_path)
    Provenance(step="lincs_ingest_compounds", dataset_accession=[R92742, R70138],
               parameters=params).write(comp_path)
    Provenance(step="lincs_context_split", dataset_accession=[R92742, R70138],
               parameters={"split_seed": SPLIT_SEED, "held_out_fraction": 0.3,
                           "min_ranking_contexts": 3},
               random_seed=SPLIT_SEED).write(split_path)
    print(stats)
    return stats


if __name__ == "__main__":
    main()
