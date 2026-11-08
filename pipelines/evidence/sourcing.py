"""Purity and sourcing check from the Broad Drug Repurposing Hub sample QC (2020-03-24).

An expert who screens Alzheimer's compounds asked that, before any lab follow-up, we show a
compound can be obtained at over 95% purity. The Hub records, for every vendor sample the
Broad bought, the purity its own LC-MS QC measured. This joins those samples to every LINCS
compound (the Drug page key is the LINCS pert_id) and keeps, per compound:

- best_purity_pct: the highest recorded purity among QC-compatible samples (percent, 0-100)
- status: at_or_above_95 / below_95 / no_purity_value (samples on record, no usable purity) /
  no_record
- n_samples, vendors, n_vendors, the best sample's vendor and catalog number, and whether any
  sample is flagged qc_incompatible (those samples never count towards best_purity_pct)
- match: inchikey (full key), inchikey_block (first 14 characters: salt or stereo variants),
  name (normalised pert_iname or Open Targets drug name), or none

Purity 0 is kept as recorded (a measured 0, i.e. the expected compound was not found);
a missing purity stays missing. Nothing is imputed.

Display only. This table feeds no ranking, threshold, pool, truth table, hidden test or verdict.

Usage: uv run python -m pipelines.evidence.sourcing
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import raw_inputs
from pipelines.evidence.lookup import normalize

SAMPLES_FILE = RAW / "evidence" / "repurposing_hub" / "repurposing_samples_20200324.txt"
SOURCE = "Broad Drug Repurposing Hub sample QC (2020)"
THRESHOLD_PCT = 95.0
RANKING = "GSE132903__main"
COLUMNS = ["pert_id", "pert_iname", "status", "best_purity_pct", "n_samples",
           "n_samples_at_or_above_95", "vendors", "n_vendors", "best_vendor", "best_catalog_no",
           "qc_incompatible", "n_qc_incompatible", "match", "hub_pert_iname", "source"]
STATUSES = ("at_or_above_95", "below_95", "no_purity_value", "no_record")


def read_samples(path: Path) -> pd.DataFrame:
    """The Hub samples table; '!' lines are file metadata. Purity normalised to percent."""
    df = pd.read_csv(path, sep="\t", comment="!", dtype=str, keep_default_na=False,
                     na_values=[""])
    need = {"broad_id", "pert_iname", "qc_incompatible", "purity", "vendor", "catalog_no",
            "InChIKey"}
    missing = need - set(df.columns)
    if missing:
        raise ValueError(f"samples file is missing columns: {sorted(missing)}")
    df["purity_pct"] = normalise_purity(df["purity"])
    df["qc_incompatible"] = df["qc_incompatible"].map({"1": True, "0": False}).astype("boolean")
    df["inchikey"] = df["InChIKey"].str.strip().str.upper()
    df["k14"] = df["inchikey"].str[:14]
    df["name_key"] = df["pert_iname"].map(normalize)
    return df


def normalise_purity(raw: pd.Series) -> pd.Series:
    """Purity as percent (0-100). The scale is decided for the whole column, never per value:
    a 0.44 in a percent file is a measured 0.44%, not 44%. A column whose maximum is <= 1
    is read as fractions and multiplied by 100."""
    vals = pd.to_numeric(raw.astype("string").str.strip().str.rstrip("%"), errors="coerce")
    finite = vals.dropna()
    if finite.empty:
        return vals.astype(float)
    if (finite < 0).any() or (finite > 100).any():
        raise ValueError("purity outside 0-100; check the file before trusting it")
    return (vals * 100.0 if finite.max() <= 1.0 else vals).astype(float)


def purity_scale(raw: pd.Series) -> str:
    finite = pd.to_numeric(raw.astype("string").str.strip().str.rstrip("%"), errors="coerce").dropna()
    return "fraction" if not finite.empty and finite.max() <= 1.0 else "percent"


def _summarise(samples: pd.DataFrame) -> dict:
    usable = samples[(samples["qc_incompatible"] != True) & samples["purity_pct"].notna()]  # noqa: E712
    vendors = sorted({v.strip() for v in samples["vendor"].dropna() if v.strip()})
    out = {
        "n_samples": int(len(samples)),
        "n_samples_at_or_above_95": int((usable["purity_pct"] >= THRESHOLD_PCT).sum()),
        "vendors": "; ".join(vendors) if vendors else None,
        "n_vendors": len(vendors),
        "qc_incompatible": bool((samples["qc_incompatible"] == True).any()),  # noqa: E712
        "n_qc_incompatible": int((samples["qc_incompatible"] == True).sum()),  # noqa: E712
        "hub_pert_iname": "; ".join(sorted(samples["pert_iname"].dropna().unique())) or None,
        "best_purity_pct": None, "best_vendor": None, "best_catalog_no": None,
    }
    if usable.empty:
        out["status"] = "no_purity_value"
        return out
    best = usable.sort_values(["purity_pct", "vendor", "catalog_no"],
                              ascending=[False, True, True], na_position="last").iloc[0]
    out["best_purity_pct"] = float(best["purity_pct"])
    out["best_vendor"] = best["vendor"] if isinstance(best["vendor"], str) else None
    out["best_catalog_no"] = best["catalog_no"] if isinstance(best["catalog_no"], str) else None
    out["status"] = "at_or_above_95" if out["best_purity_pct"] >= THRESHOLD_PCT else "below_95"
    return out


def build_sourcing(compounds: pd.DataFrame, samples: pd.DataFrame,
                   drug_names: dict[str, str] | None = None) -> pd.DataFrame:
    """One row per LINCS compound. Match by full InChIKey, then its first block, then name."""
    drug_names = drug_names or {}
    by_key = {k: g for k, g in samples[samples["inchikey"].notna()].groupby("inchikey")}
    by_k14 = {k: g for k, g in samples[samples["k14"].notna()].groupby("k14")}
    by_name = {k: g for k, g in samples[samples["name_key"] != ""].groupby("name_key")}
    rows = []
    for r in compounds.itertuples():
        key = r.inchi_key.strip().upper() if isinstance(r.inchi_key, str) else ""
        valid_key = len(key) == 27 and key.count("-") == 2
        hit, match = None, "none"
        if valid_key and key in by_key:
            hit, match = by_key[key], "inchikey"
        elif valid_key and key[:14] in by_k14:
            hit, match = by_k14[key[:14]], "inchikey_block"
        else:
            for name in (r.pert_iname, drug_names.get(str(r.pert_id))):
                nk = normalize(name)
                if nk and nk in by_name:
                    hit, match = by_name[nk], "name"
                    break
        base = {"pert_id": str(r.pert_id), "pert_iname": r.pert_iname, "match": match,
                "source": SOURCE}
        if hit is None:
            rows.append(base | {"status": "no_record", "n_samples": 0,
                                "n_samples_at_or_above_95": 0, "n_vendors": 0,
                                "qc_incompatible": False, "n_qc_incompatible": 0})
        else:
            rows.append(base | _summarise(hit))
    df = pd.DataFrame(rows).reindex(columns=COLUMNS)
    df["best_purity_pct"] = df["best_purity_pct"].astype(float)
    for col in ("n_samples", "n_samples_at_or_above_95", "n_vendors", "n_qc_incompatible"):
        df[col] = df[col].astype(int)
    df["qc_incompatible"] = df["qc_incompatible"].astype(bool)
    return df


def coverage(sourcing: pd.DataFrame, pool: pd.DataFrame, top: int | None = None) -> dict:
    """Status counts over the candidate pool (or its first `top` pool ranks)."""
    p = pool.sort_values("pool_rank")
    if top is not None:
        p = p.head(top)
    st = p[["pert_id"]].astype(str).merge(sourcing[["pert_id", "status"]], on="pert_id", how="left")
    counts = st["status"].fillna("no_record").value_counts()
    return {"n": int(len(p))} | {s: int(counts.get(s, 0)) for s in STATUSES}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", default=str(SAMPLES_FILE))
    ap.add_argument("--ranking", default=RANKING)
    args = ap.parse_args()

    raw = pd.read_csv(args.samples, sep="\t", comment="!", dtype=str)
    samples = read_samples(Path(args.samples))
    compounds = pd.read_parquet(PROCESSED / "lincs" / "compounds.parquet")
    drug_map = pd.read_parquet(PROCESSED / "evidence" / "drug_map.parquet")
    names = {str(p): n for p, n in zip(drug_map["pert_id"], drug_map["drug_name"], strict=True)
             if isinstance(n, str)}
    df = build_sourcing(compounds, samples, names)
    out_path = processed("evidence", "sourcing.parquet")
    df.to_parquet(out_path, index=False)

    pool = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__candidate_pool.parquet")
    cov_pool, cov_top20 = coverage(df, pool), coverage(df, pool, top=20)
    Provenance(
        step="sourcing",
        dataset_accession=["BroadRepurposingHub-20200324", "GSE92742", "GSE70138"],
        inputs=raw_inputs(Path(args.samples)),
        gene_mapping_version="n/a",
        model="per LINCS compound: Hub samples matched by full InChIKey, else InChIKey first "
              "block (14 chars), else normalised name (pert_iname, then Open Targets name); "
              "best purity over samples with qc_incompatible = 0 and a recorded purity",
        parameters={"threshold_pct": THRESHOLD_PCT, "purity_scale": purity_scale(raw["purity"]),
                    "purity_zero": "kept as recorded", "missing": "left missing, never imputed",
                    "n_samples": int(len(samples)), "n_compounds": int(len(df)),
                    "by_match": df["match"].value_counts().to_dict(),
                    "by_status": df["status"].value_counts().to_dict(),
                    "coverage_pool": cov_pool, "coverage_top20": cov_top20,
                    "ranking": args.ranking, "display_only": True},
    ).write(out_path)
    print({"compounds": len(df), "by_match": df["match"].value_counts().to_dict()})
    print({"pool": cov_pool})
    print({"top20": cov_top20})
    top = pool.sort_values("pool_rank").head(20)[["pool_rank", "pert_id", "drug_name"]].astype(
        {"pert_id": str}).merge(df, on="pert_id", how="left")
    print(top[["pool_rank", "drug_name", "status", "best_purity_pct", "n_vendors", "match"]]
          .to_string(index=False))


if __name__ == "__main__":
    main()
