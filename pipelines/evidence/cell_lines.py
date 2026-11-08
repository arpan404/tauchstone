"""Cell-line cards: cited facts for every LINCS cell line that can appear in a screen.

Inputs (all local):
- LINCS cell metadata: GSE92742 and GSE70138 cell_info, LINCS 2020 cellinfo_beta.
- Cellosaurus records (CC BY 4.0), fetched once per accession and cached as raw JSON
  under raw/resources/cellosaurus/. Nothing is fetched at request time.

Mapping cell_id -> Cellosaurus accession, in order:
1. the cellosaurus_id LINCS 2020 gives for the cell_id;
2. the same for the LINCS base line, for derived lines (e.g. NPC.CAS9 -> NPC);
3. for LINCS 'cell line' entries only, a Cellosaurus search where exactly one human
   record has a name or synonym equal to the cell_id after removing punctuation and case.
Primary cells, stem cells and stem-cell derived lines are never name-searched (names such
as NPC collide with unrelated lines). Anything not found is 'unspecified', never guessed.

Field precedence: Cellosaurus first, then GEO cell_info, then LINCS 2020.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance, sha256_file

LINCS = RAW / "lincs"
GEO_INFO = [
    LINCS / "GSE92742" / "GSE92742_Broad_LINCS_cell_info.txt.gz",
    LINCS / "GSE70138" / "GSE70138_Broad_LINCS_cell_info_2017-04-28.txt.gz",
]
BETA_INFO = LINCS / "LINCS2020" / "cellinfo_beta.txt"
SIG_INFO = PROCESSED / "lincs" / "sig_info.parquet"
CELLO_DIR = RAW / "resources" / "cellosaurus"
API = "https://api.cellosaurus.org"
LICENCE = "CC BY 4.0"
LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"
U = "unspecified"

# Same rule as services/api/app/services/drug_detail.py _NEURAL_CELLS (a test keeps them equal).
NEURAL_CELLS = frozenset(
    {"SHSY5Y", "NEU", "NEU.KCL", "MNEU.E", "NPC", "NPC.CAS9", "NPC.TAK", "FIBRNPC"}
)
_MISSING = {"", '""', "-666", "unknown", "Unknown", "nan", "None", "Sex unspecified",
            "Age unspecified"}
_STEM_TYPES = {"iPSC", "ESC", "differentiated"}
_STEM_CATEGORIES = {"Induced pluripotent stem cell", "Embryonic stem cell"}


def _val(x: object) -> str:
    s = "" if x is None else str(x).strip()
    return U if s in _MISSING else s


def _first(*xs: object) -> str:
    for x in xs:
        v = _val(x)
        if v != U:
            return v
    return U


def norm(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", name.upper())


# ---------- loading ----------

def load_geo(paths: list[Path] = GEO_INFO) -> pd.DataFrame:
    """GEO cell_info, GSE92742 first, filling cell_ids only GSE70138 has."""
    frames = [pd.read_csv(p, sep="\t", dtype=str, keep_default_na=False) for p in paths]
    return pd.concat(frames).drop_duplicates("cell_id").set_index("cell_id")


def load_beta(path: Path = BETA_INFO) -> pd.DataFrame:
    df = pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False)
    return df.drop_duplicates("cell_iname").set_index("cell_iname")


def lincs_cell_ids(path: Path = SIG_INFO) -> list[str]:
    return sorted(pd.read_parquet(path, columns=["cell_id"])["cell_id"].astype(str).unique())


# ---------- Cellosaurus cache ----------

def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "tauchstone-research/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_record(accession: str, cache: Path = CELLO_DIR, offline: bool = False) -> dict | None:
    dest = cache / f"{accession}.json"
    if not dest.exists():
        if offline:
            return None
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(_get(f"{API}/cell-line/{accession}?format=json"))
        time.sleep(0.2)
    lst = json.loads(dest.read_text())["Cellosaurus"]["cell-line-list"]
    return lst[0] if lst else None


def search_name(cell_id: str, cache: Path = CELLO_DIR, offline: bool = False) -> str | None:
    """Accession of the single human record whose name or synonym equals cell_id, else None."""
    dest = cache / "search" / f"{cell_id}.json"
    if not dest.exists():
        if offline:
            return None
        hits: list[dict] = []
        for field in ("id", "sy"):
            q = urllib.parse.quote(f"{field}:{cell_id}")
            body = json.loads(_get(f"{API}/search/cell-line?q={q}&format=json&rows=50"
                                   "&fields=id,ac,sy,ox"))
            hits += body["Cellosaurus"].get("cell-line-list", [])
            time.sleep(0.2)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(hits))
    return match_name(cell_id, json.loads(dest.read_text()))


def match_name(cell_id: str, hits: list[dict]) -> str | None:
    want = norm(cell_id)
    found = set()
    for h in hits:
        if not any(s.get("accession") == "9606" for s in h.get("species-list", [])):
            continue
        if any(norm(n.get("value", "")) == want for n in h.get("name-list", [])):
            found |= {a["value"] for a in h.get("accession-list", []) if a["type"] == "primary"}
    return found.pop() if len(found) == 1 else None


# ---------- facts ----------

# Stem-cell derived lines: Cellosaurus has no record, so the wording restates the LINCS
# GEO cell_info fields (cell_type, modification, subtype) and the LINCS 2020 cell_alias.
STEM_DESCRIPTIONS = {
    # GEO: differentiated; "differentiated from iPSC, but not terminally differentiated";
    # subtype "normal stem fibroblast-derived iPScs"; alias "NPC-8330-8 NEURAL PROGENITORS"
    "NPC": "neural progenitor cells made from induced pluripotent stem cells",
    "NPC.TAK": "neural progenitor cells made from induced pluripotent stem cells",
    # GEO: "NPC that were genetically modified to stably express Cas9 protein"
    "NPC.CAS9": "neural progenitor cells made from induced pluripotent stem cells, "
                "modified to express Cas9",
    # GEO: "terminally differentiated to be neurons"; alias "NPC-8330-8 NEURONS"
    "NEU": "neurons grown from the NPC-8330-8 stem-cell derived neural progenitors",
    # GEO: "differentiated from ESC to be motor neurons"
    "MNEU.E": "motor neurons made from embryonic stem cells",
    # GEO: cell_type iPSC, primary_site skin
    "FIBRNPC": "cells made from induced pluripotent stem cells of skin origin",
    # GEO: cell_type ESC
    "HUES3": "embryonic stem cells",
}
_FLUID_SITES = {"pleural effusion", "ascitic fluid"}
_SITE_LABELS = {"skin of body": "skin", "muscle organ": "muscle", "bone tissue": "bone",
                "caecum": "cecum"}
_ORGAN_WORDS = {
    "haematopoietic and lymphoid tissue": "blood", "peripheral blood": "blood",
    "large intestine": "large intestine", "ovary": "ovarian", "endometrium": "endometrial",
    "pancreas": "pancreatic", "uterine cervix": "cervical", "skin of leg": "skin",
    "breast epithelium": "breast", "stroma of bone marrow": "bone marrow",
    "adipose tissue": "adipose",
}


def _human_age(age: str) -> str:
    """'69Y' or '30Y6M' -> '69 years'; '6M' -> '6 months'; other Cellosaurus wording kept."""
    if m := re.fullmatch(r"(\d+)Y(\d+M)?", age):
        return f"{m.group(1)} years"
    if m := re.fullmatch(r"(\d+)M", age):
        return f"{m.group(1)} months"
    return age


def _sex(s: str) -> str:
    s = _val(s)
    return {"F": "female", "M": "male", "Female": "female", "Male": "male"}.get(s, s.lower() if s != U else U)


def cello_facts(rec: dict | None) -> dict:
    if not rec:
        return {}
    names = rec.get("name-list", [])
    sites = rec.get("derived-from-site-list", [])
    site = sites[0]["site"] if sites else {}
    labels = [x.get("label", "") for x in site.get("xref-list", [])]
    site_label = _SITE_LABELS.get(labels[0], labels[0]) if labels else site.get("value", "").lower()
    in_situ = site.get("site-type") == "In situ" and site_label not in _FLUID_SITES
    ctype = rec.get("cell-type") or {}
    diseases = [d.get("label", "") for d in rec.get("disease-list", []) if d.get("label")]
    return {
        "name": next((n["value"] for n in names if n["type"] == "identifier"), ""),
        "category": rec.get("category", ""),
        "sex": rec.get("sex", ""),
        "age": _human_age(_val(rec.get("age", ""))),
        "disease": diseases[0] if diseases else "",
        "sampled_from": (f"{site_label} (metastasis)" if site.get("site-type") == "Metastatic"
                         else site_label),
        "organ": site_label if in_situ else "",
        "cell_type": ctype.get("value", "") if isinstance(ctype, dict) else str(ctype),
    }


def category_of(cello_cat: str, geo: dict, beta: dict) -> str:
    """cancer / normal / stem-cell derived. Cellosaurus first, then GEO, then LINCS 2020."""
    if cello_cat == "Cancer cell line":
        return "cancer"
    if cello_cat in _STEM_CATEGORIES or geo.get("cell_type") in _STEM_TYPES:
        return "stem-cell derived"
    if cello_cat:
        return "normal"
    if geo.get("sample_type") == "tumor":
        return "cancer"
    if geo.get("sample_type") in {"normal", "primary"}:
        return "normal"
    return {"tumor": "cancer", "normal": "normal"}.get(beta.get("cell_type", ""), U)


def summary(category: str, organ: str, description: str, sex: str, age: str) -> str:
    """One plain sentence built only from the facts."""
    word = _ORGAN_WORDS.get(organ, organ)
    if category == "cancer" and organ != U:
        what = f"{word.capitalize()} cancer cells"
    elif description != U and category == "stem-cell derived":
        what = description[0].upper() + description[1:]
    elif category == "normal" and organ != U:
        what = f"Non-cancer {word} cells"
    else:
        what = "Human cells"
    m = re.fullmatch(r"(\d+) years", age)
    if m:
        years = int(m.group(1))
        adult = years >= 18
        person = {"female": "woman" if adult else "girl",
                  "male": "man" if adult else "boy"}.get(sex, "donor")
        article = "an" if str(years).startswith("8") or years in (11, 18) else "a"
        return f"{what}, from {article} {years}-year-old {person}."
    if sex in ("female", "male"):
        return f"{what}, from a {sex} donor."
    return f"{what}."


def build(cell_ids: list[str], geo: pd.DataFrame, beta: pd.DataFrame,
          accession: dict[str, tuple[str, str]], records: dict[str, dict]) -> pd.DataFrame:
    """accession: cell_id -> (CVCL or 'unspecified', how it was mapped)."""
    rows = []
    for cid in cell_ids:
        g = geo.loc[cid].to_dict() if cid in geo.index else {}
        base = _val(g.get("base_cell_id", ""))
        b = (beta.loc[cid].to_dict() if cid in beta.index
             else beta.loc[base].to_dict() if base in beta.index else {})
        ac, how = accession.get(cid, (U, U))
        c = cello_facts(records.get(ac))
        organ = _first(c.get("organ"), g.get("primary_site"), b.get("cell_lineage")).replace("_", " ")
        category = category_of(c.get("category", ""), g, b)
        description = _first(STEM_DESCRIPTIONS.get(cid), c.get("cell_type"),
                             g.get("subtype") if category != "cancer" else "")
        sex = _sex(_first(c.get("sex"), g.get("donor_sex"), b.get("donor_sex")))
        age = _first(c.get("age"),
                     f"{g['donor_age']} years" if _val(g.get("donor_age")) != U else "",
                     f"{b['donor_age']} years" if _val(b.get("donor_age")) != U else "")
        sources = ["LINCS cell info (GSE92742, GSE70138, LINCS 2020)"]
        if c:
            sources.insert(0, f"Cellosaurus {ac}")
        rows.append({
            "cell_id": cid,
            "display_name": _first(c.get("name"), cid),
            "cellosaurus_id": ac,
            "cellosaurus_match": how,
            "cellosaurus_category": _first(c.get("category")),
            "organ": organ,
            "sampled_from": _first(c.get("sampled_from")),
            "disease": _first(c.get("disease"), g.get("subtype") if category == "cancer" else ""),
            "description": description,
            "category": category,
            "sex": sex,
            "age": age,
            "neural": cid in NEURAL_CELLS,
            "summary": summary(category, organ, description, sex, age),
            "source": "; ".join(sources),
            "licence": f"Cellosaurus data {LICENCE}" if c else "LINCS metadata",
            "source_url": f"https://www.cellosaurus.org/{ac}" if c else U,
        })
    return pd.DataFrame(rows)


def map_accessions(cell_ids: list[str], geo: pd.DataFrame, beta: pd.DataFrame,
                   offline: bool = False) -> dict[str, tuple[str, str]]:
    out: dict[str, tuple[str, str]] = {}
    for cid in cell_ids:
        g = geo.loc[cid].to_dict() if cid in geo.index else {}
        base = _val(g.get("base_cell_id", ""))
        own = _val(beta.loc[cid, "cellosaurus_id"]) if cid in beta.index else U
        via = _val(beta.loc[base, "cellosaurus_id"]) if base != cid and base in beta.index else U
        if own != U:
            out[cid] = (own, "LINCS 2020 cellosaurus_id")
        elif via != U:
            out[cid] = (via, f"LINCS 2020 cellosaurus_id of base line {base}")
        elif g.get("cell_type") == "cell line" and (hit := search_name(cid, offline=offline)):
            out[cid] = (hit, "Cellosaurus exact name match")
        else:
            out[cid] = (U, U)
    return out


def main(argv: list[str] | None = None) -> Path:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", action="store_true", help="use only the cached Cellosaurus JSON")
    args = ap.parse_args(argv)
    cell_ids = lincs_cell_ids()
    geo, beta = load_geo(), load_beta()
    accession = map_accessions(cell_ids, geo, beta, offline=args.offline)
    records = {ac: r for ac, _ in set(accession.values()) if ac != U
               and (r := fetch_record(ac, offline=args.offline))}
    df = build(cell_ids, geo, beta, accession, records)
    out = processed("evidence", "cell_lines.parquet")
    df.to_parquet(out, index=False)
    cached = sorted(CELLO_DIR.glob("CVCL_*.json"))
    Provenance(
        step="evidence.cell_lines",
        dataset_accession=["GSE92742", "GSE70138", "LINCS2020", "Cellosaurus"],
        inputs={str(p.relative_to(RAW)): sha256_file(p) for p in [*GEO_INFO, BETA_INFO, *cached]},
        sample_filter="cell_ids present in processed/lincs/sig_info.parquet",
        model="rule-based field precedence: Cellosaurus, then GEO cell_info, then LINCS 2020",
        parameters={"cellosaurus_api": API, "licence": LICENCE, "licence_url": LICENCE_URL,
                    "n_cell_lines": len(df),
                    "n_cellosaurus": int((df.cellosaurus_id != U).sum())},
    ).write(out)
    print(f"{len(df)} cell lines, {(df.cellosaurus_id != U).sum()} with Cellosaurus -> {out}")
    return out


if __name__ == "__main__":
    main()
