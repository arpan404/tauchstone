"""CMap LINCS 2020 beta ingest. Post-expo, exploratory, NOT part of the preregistered analysis.

Reads raw/lincs/LINCS2020 (fetched with `scripts/fetch_data.py --group lincs/LINCS2020`) into the
same shapes as the 2017 ingest (pipelines/lincs/ingest.py), but writes to a SEPARATE folder,
processed/lincs2020/, so no frozen artifact under processed/lincs/ is ever touched:

  sig_info.parquet         trt_cp signature metadata, frozen sig_info columns + extras (below)
  genes.parquet            entrez_id (string), symbol, is_landmark, is_bing, ensembl_id
  landmark_order.parquet   col -> entrez_id (matrix column order, Entrez ascending, like 2017)
  compounds.parquet        pert_id, pert_iname, canonical_smiles, inchi_key, n_signatures,
                           n_contexts, target, moa
  level5_landmark_f32.npy  float32 (n_trt_cp, n_landmark), rows = sig_info.row  [`matrix` step]

Run:
  uv run python -m pipelines.lincs.lincs2020 verify      # S3 multipart-ETag check of raw files
  uv run python -m pipelines.lincs.lincs2020 metadata    # the three tables (cheap)
  uv run python -m pipelines.lincs.lincs2020 matrix      # ~2.8 GB float32 landmark matrix

Frozen-schema notes (contracts/parquet/README.md, lincs/*):
* sig_info keeps the frozen column names. 2020 renames are mapped back: cmap_name -> pert_iname,
  cell_iname -> cell_id, cc_q75 -> distil_cc_q75, nsample -> distil_nsample.
* is_gold is absent, as in the 2017 ingest. 2020 ships is_hiq / qc_pass / is_exemplar_sig / tas
  instead; they are carried as extra columns, not renamed to is_gold (different definitions).
* Extra columns are appended after the frozen ones: is_hiq, qc_pass, is_exemplar_sig, tas,
  frozen_split. source is always "LINCS2020".
* Doses: nM -> uM, uM kept. Other units (2020 adds ug/ml, ng/ml, ...) are kept verbatim, never
  converted (no molecular weights here). Missing/sentinel doses or times -> 'unspecified'.
  Canonical strings ('10 uM', '24 h') and context_id = cell|idose|itime use the 2017 formatter,
  so a 2020 context can be matched against the frozen 2017 context split.
* frozen_split: the 2020 release re-contains most 2017 signatures (290,925 of the 312,438 frozen
  trt_cp sig_ids), including contexts held out by the frozen split. Each row is tagged ranking /
  held_out / not_in_frozen_split from processed/lincs/context_split.parquet and sig_info.parquet
  (read-only), matching by context AND by sig_id, held_out winning (see tag_frozen_split).
  Anything built on this data must drop held_out rows or treat itself as exploratory. The tag is
  metadata only and needs human review before anything relies on it.
* GCTX layout is the same as 2017 (checked on the real file by HTTP range reads, 2026-11-08):
  /0/DATA/0/matrix is (n_signatures, 12328), row ids = Entrez strings, col ids = sig_id.
* order/rank int16 precomputes from the 2017 ingest are not built here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import urllib.request
from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import PROCESSED, RAW
from pipelines.common.provenance import Provenance, raw_checksum, sha256_file
from pipelines.lincs import gctx
from pipelines.lincs.ingest import canon_dose, canon_time

RELEASE = "LINCS2020"
GROUP = "lincs/LINCS2020"
ACCESSION = "CMap LINCS 2020 beta (s3://macchiato.clue.io/builds/LINCS2020, Dec 2020)"
BASE_URL = "https://s3.amazonaws.com/macchiato.clue.io/builds/LINCS2020/"
RAW_DIR = RAW / GROUP
OUT_DIR = PROCESSED / "lincs2020"
FROZEN_SPLIT = PROCESSED / "lincs" / "context_split.parquet"
VALIDATION_CONTEXT = "exploratory post-expo source; not preregistered; feeds no frozen artifact"

FILES = {
    "gctx": "level5_beta_trt_cp_n720216x12328.gctx",
    "sig_info": "siginfo_beta.txt",
    "gene_info": "geneinfo_beta.txt",
    "compound_info": "compoundinfo_beta.txt",
    "cell_info": "cellinfo_beta.txt",
}
# Remote path (under BASE_URL) for each local file name, for ETag verification.
REMOTE = {
    "level5_beta_trt_cp_n720216x12328.gctx": "level5/level5_beta_trt_cp_n720216x12328.gctx",
    "siginfo_beta.txt": "siginfo_beta.txt",
    "geneinfo_beta.txt": "geneinfo_beta.txt",
    "compoundinfo_beta.txt": "compoundinfo_beta.txt",
    "cellinfo_beta.txt": "cellinfo_beta.txt",
    "README.txt": "README.txt",
    "LINCS2020_Release_Metadata_Field_Definitions.xlsx":
        "LINCS2020%20Release%20Metadata%20Field%20Definitions.xlsx",
}

FROZEN_SIG_COLUMNS = ["sig_id", "pert_id", "pert_iname", "cell_id", "pert_idose", "pert_itime",
                      "pert_dose", "pert_dose_unit", "pert_time", "pert_time_unit",
                      "distil_cc_q75", "pct_self_rank_q25", "distil_nsample",
                      "source", "context_id", "row"]
EXTRA_SIG_COLUMNS = ["is_hiq", "qc_pass", "is_exemplar_sig", "tas", "frozen_split"]
SENTINELS = {"", "-666", "-666.0", "nan", "None"}
MOLAR = {"um": ("uM", 1.0), "µm": ("uM", 1.0), "μm": ("uM", 1.0), "nm": ("uM", 1e-3)}


def raw_paths(raw_dir: Path = RAW_DIR) -> dict[str, Path]:
    return {k: raw_dir / v for k, v in FILES.items()}


def _missing(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x)) or str(x).strip() in SENTINELS


def normalise_dose(value, unit) -> tuple[float, str]:
    """(value, unit) from siginfo -> (value, unit) with nM folded into uM; other units verbatim."""
    if _missing(value) or _missing(unit):
        return math.nan, "unspecified"
    try:
        v = float(value)
    except ValueError:
        return math.nan, "unspecified"
    u = str(unit).strip()
    if u.lower() in MOLAR:
        name, factor = MOLAR[u.lower()]
        return v * factor, name
    return v, u


def normalise_time(value, unit) -> tuple[float, str]:
    if _missing(value) or _missing(unit):
        return math.nan, "unspecified"
    try:
        return float(value), str(unit).strip()
    except ValueError:
        return math.nan, "unspecified"


def load_genes(path: Path, expect_landmarks: int | None = 978) -> tuple[pd.DataFrame, pd.DataFrame]:
    """geneinfo_beta.txt -> (genes, landmark_order). BING includes the landmarks, as in 2017."""
    g = pd.read_csv(path, sep="\t", dtype={"gene_id": str}, keep_default_na=False)
    space = g["feature_space"].str.strip().str.lower()
    genes = pd.DataFrame({
        "entrez_id": g["gene_id"].str.strip().astype(int).astype(str),
        "symbol": g["gene_symbol"].astype(str),
        "is_landmark": space.eq("landmark"),
        "is_bing": space.isin(["landmark", "best inferred"]),
        "ensembl_id": g["ensembl_id"].replace({"": None, '""': None}),
    })
    if not genes["entrez_id"].is_unique:
        raise ValueError("duplicate Entrez ids in geneinfo")
    lm = sorted(genes.loc[genes["is_landmark"], "entrez_id"], key=int)
    if expect_landmarks is not None and len(lm) != expect_landmarks:
        raise ValueError(f"{len(lm)} landmark genes, expected {expect_landmarks}")
    order = pd.DataFrame({"col": np.arange(len(lm)), "entrez_id": lm})
    return genes, order


def load_sig_info(path: Path, gctx_sig_ids: Iterable[str] | None = None) -> tuple[pd.DataFrame, dict]:
    """siginfo_beta.txt -> trt_cp sig_info in the frozen 2017 shape (+ extras).

    When `gctx_sig_ids` is given, rows not in the GCTX are dropped (and counted) so that
    `row` indexes the matrix exactly.
    """
    usecols = ["sig_id", "pert_id", "pert_type", "cmap_name", "cell_iname", "pert_dose",
               "pert_dose_unit", "pert_time", "pert_time_unit", "cc_q75", "pct_self_rank_q25",
               "nsample", "is_hiq", "qc_pass", "is_exemplar_sig", "tas"]
    df = pd.read_csv(path, sep="\t", usecols=usecols, dtype=str, keep_default_na=False)
    stats = {"n_siginfo_rows": len(df)}
    df = df[df["pert_type"] == "trt_cp"].copy()
    stats["n_trt_cp_siginfo"] = len(df)
    if gctx_sig_ids is not None:
        present = set(gctx_sig_ids)
        keep = df["sig_id"].isin(present)
        stats["n_trt_cp_not_in_gctx"] = int((~keep).sum())
        df = df[keep].copy()
    if not df["sig_id"].is_unique:
        raise ValueError("duplicate sig_id among trt_cp signatures")

    dose = [normalise_dose(v, u) for v, u in zip(df["pert_dose"], df["pert_dose_unit"], strict=True)]
    time = [normalise_time(v, u) for v, u in zip(df["pert_time"], df["pert_time_unit"], strict=True)]
    num = lambda s: pd.to_numeric(s.replace(list(SENTINELS), np.nan), errors="coerce")  # noqa: E731
    flag = lambda s: num(s).astype("Int64").astype("boolean")  # noqa: E731
    out = pd.DataFrame({
        "sig_id": df["sig_id"].to_numpy(),
        "pert_id": df["pert_id"].to_numpy(),
        "pert_iname": df["cmap_name"].to_numpy(),
        "cell_id": df["cell_iname"].replace("", "unspecified").to_numpy(),
        "pert_idose": [canon_dose(v, u) for v, u in dose],
        "pert_itime": [canon_time(v, u) for v, u in time],
        "pert_dose": np.array([v for v, _ in dose], dtype="float64"),
        "pert_dose_unit": [u for _, u in dose],
        "pert_time": np.array([v for v, _ in time], dtype="float64"),
        "pert_time_unit": [u for _, u in time],
        "distil_cc_q75": num(df["cc_q75"]).astype("float64").to_numpy(),
        "pct_self_rank_q25": num(df["pct_self_rank_q25"]).astype("float64").to_numpy(),
        "distil_nsample": num(df["nsample"]).astype("Int64").to_numpy(),
        "source": RELEASE,
        "is_hiq": flag(df["is_hiq"]).to_numpy(),
        "qc_pass": flag(df["qc_pass"]).to_numpy(),
        "is_exemplar_sig": flag(df["is_exemplar_sig"]).to_numpy(),
        "tas": num(df["tas"]).astype("float64").to_numpy(),
    })
    out["context_id"] = out["cell_id"] + "|" + out["pert_idose"] + "|" + out["pert_itime"]
    out["row"] = np.arange(len(out), dtype=np.int64)
    out["frozen_split"] = "not_in_frozen_split"
    stats["n_trt_cp"] = len(out)
    stats["dose_unspecified"] = int((out["pert_idose"] == "unspecified").sum())
    stats["dose_units"] = out["pert_dose_unit"].value_counts().to_dict()
    return out[FROZEN_SIG_COLUMNS + EXTRA_SIG_COLUMNS], stats


def tag_frozen_split(sig_info: pd.DataFrame, context_split: pd.DataFrame,
                     sig_info_2017: pd.DataFrame | None = None) -> pd.DataFrame:
    """Tag each 2020 row ranking / held_out / not_in_frozen_split from the frozen 2017 split.

    Conservative, because context strings do not always match across releases (2017 doses such
    as 9.99 uM vs 2020 10 uM): a row is tagged by its own (pert_id, context_id) AND, when
    `sig_info_2017` is given, by its sig_id's 2017 context. held_out wins over ranking, and a
    2020 context holding any held_out signature is held_out as a whole. Metadata only.
    """
    rank = {"not_in_frozen_split": 0, "ranking": 1, "held_out": 2}
    name = {v: k for k, v in rank.items()}
    split = context_split[["pert_id", "context_id", "split"]].drop_duplicates(["pert_id", "context_id"])
    pair = dict(zip(zip(split["pert_id"], split["context_id"], strict=True), split["split"].map(rank),
                    strict=True))
    level = pd.Series([pair.get(k, 0) for k in zip(sig_info["pert_id"], sig_info["context_id"], strict=True)],
                      index=sig_info.index)
    if sig_info_2017 is not None:
        old = sig_info_2017[["sig_id", "pert_id", "context_id"]]
        by_sig = dict(zip(old["sig_id"], [pair.get(k, 0) for k in zip(old["pert_id"], old["context_id"],
                                                                         strict=True)], strict=True))
        level = np.maximum(level, sig_info["sig_id"].map(by_sig).fillna(0).astype(int))
    held_ctx = set(zip(sig_info["pert_id"][level == 2], sig_info["context_id"][level == 2], strict=True))
    whole = pd.Series([k in held_ctx for k in zip(sig_info["pert_id"], sig_info["context_id"], strict=True)],
                      index=sig_info.index)
    level = level.mask(whole, 2)
    tagged = sig_info.copy()
    tagged["frozen_split"] = level.map(name).to_numpy()
    return tagged


def load_compounds(path: Path, sig_info: pd.DataFrame) -> pd.DataFrame:
    """compoundinfo_beta.txt (one row per compound/moa/target) -> one row per trt_cp pert_id."""
    ci = pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False)
    for c in ["cmap_name", "target", "moa", "canonical_smiles", "inchi_key"]:
        ci[c] = ci[c].mask(ci[c].str.strip().isin(SENTINELS | {'""'}))

    def first(s: pd.Series):
        s = s.dropna()
        return s.iloc[0] if len(s) else None

    def joined(s: pd.Series):
        vals = sorted(set(s.dropna()))
        return "|".join(vals) if vals else None

    info = ci.groupby("pert_id").agg(
        info_name=("cmap_name", first), canonical_smiles=("canonical_smiles", first),
        inchi_key=("inchi_key", first), target=("target", joined), moa=("moa", joined),
    ).reset_index()
    counts = sig_info.groupby("pert_id").agg(
        sig_name=("pert_iname", lambda s: s.value_counts().index[0]),
        n_signatures=("sig_id", "size"), n_contexts=("context_id", "nunique"),
    ).reset_index()
    out = counts.merge(info, on="pert_id", how="left", validate="one_to_one")
    # Name: what siginfo calls it (the signatures' own label); compoundinfo only fills gaps.
    out["pert_iname"] = out["sig_name"].where(out["sig_name"].astype(bool), out["info_name"])
    return out[["pert_id", "pert_iname", "canonical_smiles", "inchi_key", "n_signatures",
                "n_contexts", "target", "moa"]].sort_values("pert_id").reset_index(drop=True)


def build_matrix(gctx_path: Path, sig_info: pd.DataFrame, landmark: list[str], out: Path,
                 block_size: int = 10_000) -> tuple[int, ...]:
    """Fill a float32 (len(sig_info), len(landmark)) .npy, rows = sig_info.row. Refuses NaN."""
    row_of = dict(zip(sig_info["sig_id"], sig_info["row"], strict=True))
    mat = np.lib.format.open_memmap(out, mode="w+", dtype=np.float32, shape=(len(sig_info), len(landmark)))
    filled = 0
    for sids, block in gctx.iter_blocks(gctx_path, genes=landmark, block_size=block_size):
        sel = np.array([s in row_of for s in sids])
        if sel.any():
            mat[[row_of[s] for s in sids[sel]]] = block[sel]
            filled += int(sel.sum())
    if filled != len(sig_info):
        raise ValueError(f"filled {filled} rows, expected {len(sig_info)}")
    if np.isnan(mat).any():
        raise ValueError("NaN in LINCS 2020 landmark matrix; refusing to keep it")
    mat.flush()
    shape = mat.shape
    del mat
    return shape


def s3_etag(path: Path, part_size: int) -> str:
    """Multipart S3 ETag ('<md5 of part md5s>-<n parts>') for a file uploaded in `part_size` parts."""
    digests = []
    with path.open("rb") as f:
        while chunk := f.read(part_size):
            digests.append(hashlib.md5(chunk).digest())
    return f"{hashlib.md5(b''.join(digests)).hexdigest()}-{len(digests)}"


def _single_md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def part_size_candidates(size: int, n_parts: int) -> list[int]:
    """Whole-MiB part sizes p with (n-1)*p < size <= n*p (how S3 multipart ETags are formed)."""
    mib = 1 << 20
    lo = -(-size // n_parts)  # ceil
    hi = size // (n_parts - 1) if n_parts > 1 else size
    return [p for p in range(-(-lo // mib) * mib, hi + 1, mib) if (n_parts - 1) * p < size <= n_parts * p]


def etag_matches(path: Path, etag: str) -> bool:
    etag = etag.strip('"')
    if "-" not in etag:
        return _single_md5(path) == etag
    n = int(etag.rsplit("-", 1)[1])
    return any(s3_etag(path, p) == etag for p in part_size_candidates(path.stat().st_size, n))


def remote_etag(name: str) -> tuple[str, int]:
    req = urllib.request.Request(BASE_URL + REMOTE[name], method="HEAD")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.headers["ETag"].strip('"'), int(r.headers["Content-Length"])


def _inputs(names: Iterable[str]) -> dict[str, str | None]:
    return {f"{GROUP}/{n}": raw_checksum(f"{GROUP}/{n}") for n in names}


def _params(stats: dict) -> dict:
    return {"release": RELEASE, "pert_type": "trt_cp", "gene_space": "landmark",
            "dose": "nM->uM; other units verbatim; missing -> unspecified",
            "frozen_split_tag": "from processed/lincs/context_split.parquet (read-only) when present",
            "stats": stats}


def run_metadata(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR, frozen_split: Path | None = FROZEN_SPLIT,
                 expect_landmarks: int | None = 978) -> dict:
    if out_dir.resolve() == (PROCESSED / "lincs").resolve():
        raise ValueError("LINCS 2020 outputs must not go into the frozen processed/lincs folder")
    p = raw_paths(raw_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stats: dict = {}

    genes, order = load_genes(p["gene_info"], expect_landmarks)
    gctx_ids = None
    if p["gctx"].exists() and not p["gctx"].with_name(p["gctx"].name + ".aria2").exists():
        gene_ids, gctx_ids = gctx.read_ids(p["gctx"])
        if set(gene_ids) != set(genes["entrez_id"]):
            raise ValueError("GCTX genes != geneinfo genes")
    stats["gctx_ids_checked"] = gctx_ids is not None
    sig_info, sig_stats = load_sig_info(p["sig_info"], gctx_ids)
    stats |= sig_stats
    split_sha = None
    if frozen_split is not None and frozen_split.exists():
        old_path = frozen_split.with_name("sig_info.parquet")
        old = pd.read_parquet(old_path, columns=["sig_id", "pert_id", "context_id"]) if old_path.exists() else None
        sig_info = tag_frozen_split(sig_info, pd.read_parquet(frozen_split), old)
        split_sha = sha256_file(frozen_split)
        stats["frozen_split_matched_by_sig_id"] = old is not None
    stats["frozen_split"] = sig_info["frozen_split"].value_counts().to_dict()
    compounds = load_compounds(p["compound_info"], sig_info)
    stats["n_compounds"] = len(compounds)
    stats["n_genes"], stats["n_landmark"] = len(genes), len(order)

    written = {}
    for name, frame, used in (("genes.parquet", genes, [FILES["gene_info"]]),
                              ("landmark_order.parquet", order, [FILES["gene_info"]]),
                              ("sig_info.parquet", sig_info, [FILES["sig_info"], FILES["gctx"]]),
                              ("compounds.parquet", compounds, [FILES["compound_info"], FILES["sig_info"]])):
        path = out_dir / name
        frame.to_parquet(path, index=False)
        inputs = _inputs(used)
        if name == "sig_info.parquet" and split_sha:
            inputs["processed/lincs/context_split.parquet (read-only tag)"] = split_sha
        Provenance(step=f"lincs2020_{name.split('.')[0]}", dataset_accession=ACCESSION, inputs=inputs,
                   gene_mapping_version="geneinfo_beta.txt (LINCS2020)", parameters=_params(stats),
                   validation_context=VALIDATION_CONTEXT).write(path)
        written[name] = str(path)
    stats["written"] = written
    return stats


def run_matrix(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> dict:
    sig_info = pd.read_parquet(out_dir / "sig_info.parquet")
    landmark = pd.read_parquet(out_dir / "landmark_order.parquet")["entrez_id"].tolist()
    path = out_dir / "level5_landmark_f32.npy"
    shape = build_matrix(raw_paths(raw_dir)["gctx"], sig_info, landmark, path)
    stats = {"matrix_shape": list(shape), "matrix_dtype": "float32"}
    Provenance(step="lincs2020_matrix", dataset_accession=ACCESSION, inputs=_inputs([FILES["gctx"]]),
               gene_mapping_version="geneinfo_beta.txt (LINCS2020)", parameters=_params(stats),
               validation_context=VALIDATION_CONTEXT).write(path)
    return stats


def run_verify(raw_dir: Path = RAW_DIR) -> dict[str, str]:
    """Compare every downloaded file with its S3 size and multipart ETag (network: HEAD only)."""
    result = {}
    for name in REMOTE:
        path = raw_dir / name
        if not path.exists() or path.with_name(name + ".aria2").exists():
            result[name] = "missing or incomplete"
            continue
        etag, size = remote_etag(name)
        if path.stat().st_size != size:
            result[name] = f"SIZE MISMATCH local={path.stat().st_size} remote={size}"
        else:
            result[name] = f"ok etag={etag}" if etag_matches(path, etag) else f"ETAG MISMATCH remote={etag}"
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("step", choices=["verify", "metadata", "matrix"])
    ap.add_argument("--raw", type=Path, default=RAW_DIR)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args(argv)
    if args.step == "verify":
        res = run_verify(args.raw)
        print(json.dumps(res, indent=2))
        return 0 if all(v.startswith("ok") for v in res.values()) else 1
    stats = run_metadata(args.raw, args.out) if args.step == "metadata" else run_matrix(args.raw, args.out)
    print(json.dumps(stats, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
