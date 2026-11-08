"""Withdrawn status from ChEMBL 37 for every drug in approval.parquet.

A drug counts as withdrawn when any member of its ChEMBL family (the parent molecule and
its salt forms, via molecule_hierarchy) has molecule_dictionary.withdrawn_flag = 1 or a
drug_warning row with warning_type 'Withdrawn'. Year is the earliest withdrawal year;
class and country list the distinct values, earliest first.

Display only. This table feeds no ranking, pool, truth table or benchmark.
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import raw_inputs
from pipelines.evidence.exposure import CHEMBL_DB

SOURCE = "ChEMBL 37"
COLUMNS = ["pert_id", "chembl_id", "withdrawn", "withdrawn_year", "withdrawn_class",
           "withdrawn_country", "family_chembl_ids", "source"]


def _in(n: int) -> str:
    return ",".join("?" * n)


def family_map(con: sqlite3.Connection, chembl_ids: list[str]) -> dict[str, set[int]]:
    """chembl_id -> molregnos of its parent plus every salt form of that parent."""
    if not chembl_ids:
        return {}
    rows = con.execute(
        "select md.chembl_id, md.molregno, coalesce(mh.parent_molregno, md.molregno) "
        "from molecule_dictionary md left join molecule_hierarchy mh on mh.molregno = md.molregno "
        f"where md.chembl_id in ({_in(len(chembl_ids))})", chembl_ids).fetchall()
    parent_of = {c: (m, p) for c, m, p in rows}
    parents = sorted({p for _, p in parent_of.values()})
    kids: dict[int, set[int]] = {p: {p} for p in parents}
    if parents:
        for m, p in con.execute(
                f"select molregno, parent_molregno from molecule_hierarchy "
                f"where parent_molregno in ({_in(len(parents))})", parents).fetchall():
            kids.setdefault(p, {p}).add(m)
    return {c: kids[p] | {m} for c, (m, p) in parent_of.items()}


def _join(values: list[str]) -> str | None:
    seen: list[str] = []
    for v in values:
        for part in str(v).split(";"):
            part = part.strip()
            if part and part not in seen:
                seen.append(part)
    return "; ".join(seen) if seen else None


def build_withdrawn(con: sqlite3.Connection, approval: pd.DataFrame) -> pd.DataFrame:
    pairs = approval[["pert_id", "chembl_id"]].drop_duplicates()
    ids = sorted({c for c in pairs["chembl_id"] if isinstance(c, str)})
    fams = family_map(con, ids)
    regs = sorted({m for f in fams.values() for m in f})
    flag: dict[int, bool] = {}
    names: dict[int, str] = {}
    warns: dict[int, list[tuple[int | None, str | None, str | None]]] = {}
    if regs:
        for m, c, w in con.execute(
                f"select molregno, chembl_id, withdrawn_flag from molecule_dictionary "
                f"where molregno in ({_in(len(regs))})", regs).fetchall():
            names[m] = c
            flag[m] = bool(w)
        for m, y, cls, ctry in con.execute(
                "select molregno, warning_year, warning_class, warning_country from drug_warning "
                f"where warning_type = 'Withdrawn' and molregno in ({_in(len(regs))})",
                regs).fetchall():
            warns.setdefault(m, []).append((y, cls, ctry))
    out = []
    for r in pairs.itertuples():
        fam = sorted(fams.get(r.chembl_id, set())) if isinstance(r.chembl_id, str) else []
        rows = sorted((w for m in fam for w in warns.get(m, [])),
                      key=lambda w: (w[0] is None, w[0] or 0))
        years = [w[0] for w in rows if w[0] is not None]
        is_withdrawn = bool(rows) or any(flag.get(m, False) for m in fam)
        out.append({
            "pert_id": str(r.pert_id),
            "chembl_id": r.chembl_id if isinstance(r.chembl_id, str) else None,
            "withdrawn": is_withdrawn,
            "withdrawn_year": min(years) if years else None,
            "withdrawn_class": _join([w[1] for w in rows if w[1]]) if is_withdrawn else None,
            "withdrawn_country": _join([w[2] for w in rows if w[2]]) if is_withdrawn else None,
            "family_chembl_ids": ",".join(sorted(names[m] for m in fam if m in names)) or None,
            "source": SOURCE,
        })
    df = pd.DataFrame(out, columns=COLUMNS)
    df["withdrawn_year"] = df["withdrawn_year"].astype("Int64")
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chembl", default=str(CHEMBL_DB))
    args = ap.parse_args()
    db = Path(args.chembl)
    if not db.exists():
        raise SystemExit(f"ChEMBL SQLite not extracted ({db})")
    approval_path = PROCESSED / "evidence" / "approval.parquet"
    approval = pd.read_parquet(approval_path)
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        df = build_withdrawn(con, approval)
    finally:
        con.close()
    out_path = processed("evidence", "withdrawn.parquet")
    df.to_parquet(out_path, index=False)
    Provenance(
        step="withdrawn",
        dataset_accession=["ChEMBL-37"],
        inputs=raw_inputs(RAW / "evidence" / "chembl" / "chembl_37_sqlite.tar.gz"),
        gene_mapping_version="n/a",
        model="molecule_dictionary.withdrawn_flag OR drug_warning(warning_type='Withdrawn') "
              "over parent + salt forms (molecule_hierarchy)",
        parameters={"approval_input": str(approval_path.name),
                    "n_drugs": int(len(df)), "n_withdrawn": int(df["withdrawn"].sum()),
                    "display_only": True},
    ).write(out_path)
    print({"n": len(df), "withdrawn": int(df["withdrawn"].sum())})


if __name__ == "__main__":
    main()
