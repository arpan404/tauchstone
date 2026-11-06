"""Brain exposure from ChEMBL SQLite + RDKit physchem prediction.

Levels (strongest first): measured_human_cns | measured_preclinical | curated |
predicted | none. Only measured rows can feed the truth-table brain_exposure context:
survive if measured human CNS PK, or Kp >= 0.1, or PAMPA-BBB Pe >= 4e-6 cm/s.

Measure labels follow contracts/parquet/README.md: kp / pampa_pe / csf / predicted_mpo.
(Deviations from the task text's 'brain_ratio' label are noted in the report.)
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, RAW, processed
from pipelines.common.provenance import Provenance
from pipelines.evidence._common import chembl_card_url, raw_inputs

CHEMBL_DB = RAW / "evidence" / "chembl" / "extracted" / "chembl_37" / "chembl_37_sqlite" / "chembl_37.db"

KP_SURVIVE = 0.1
PE_SURVIVE = 4e-6  # cm/s

# --- description matchers ----------------------------------------------------
_CSF_TOKEN = re.compile(r"\bcsf\b")
_CSF_EXCLUDE = ("csf1r", "csf-1r", "g-csf", "gm-csf", "m-csf", "csf-1 ")
_BRAIN = re.compile(r"\bbrain\b")
_PAMPA = re.compile(r"pampa", re.IGNORECASE)
_BBB = re.compile(r"bbb|blood.brain", re.IGNORECASE)
_INVERTED = re.compile(r"(blood|plasma|serum) to brain", re.IGNORECASE)
_PREDICTED = re.compile(r"predict|in silico|calculated", re.IGNORECASE)
# ex-vivo/in-vitro binding readouts in brain tissue are not drug exposure
_BINDING = re.compile(r"binding affinity|signal-to-noise|signal to noise|autoradiograph"
                      r"|immunohistochem|\bdapi\b|plaque|staining", re.IGNORECASE)


def mentions_csf(desc) -> bool:
    if not isinstance(desc, str):
        return False
    d = desc.lower()
    if any(x in d for x in _CSF_EXCLUDE):
        return False
    return "cerebrospinal" in d or bool(_CSF_TOKEN.search(d))


def mentions_brain(desc) -> bool:
    if not isinstance(desc, str):
        return False
    return bool(_BRAIN.search(desc.lower()))


def is_predicted_desc(desc) -> bool:
    if not isinstance(desc, str):
        return False
    return bool(_PREDICTED.search(desc))


# --- unit conversions --------------------------------------------------------
PE_UNIT_FACTOR = {
    # unit string (lowercased, stripped) -> factor to cm/s
    "cm/s": 1.0, "cm.s-1": 1.0, "cm s-1": 1.0,
    "10^-6 cm/s": 1e-6, "10'-6 cm/s": 1e-6, "10-6 cm/s": 1e-6,
    "1e-6 cm/s": 1e-6, "10e-6 cm/s": 1e-6, "10’−6 cm/s": 1e-6,
    "10'6cm/s": 1e-6,  # assumed typo for 10^-6; flagged in summary/provenance
    "10^-5 cm/s": 1e-5, "10'-5 cm/s": 1e-5,
    "nm/s": 1e-7, "nm s-1": 1e-7, "nm.s-1": 1e-7,
    "ucm/s": 1e-4, "um/s": 1e-4, "µm/s": 1e-4,  # micro m/s
}


def normalise_pe_to_cm_s(value: float, unit: str | None) -> float | None:
    """Permeability value -> cm/s. Returns None for unknown units."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if unit is None:
        return None
    factor = PE_UNIT_FACTOR.get(str(unit).strip().lower())
    if factor is None:
        return None
    return float(value) * factor


def logbb_to_kp(value: float) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return 10.0 ** float(value)


# --- ratio / permeability classification -------------------------------------
RATIO_TYPES = {"kp", "kp,uu", "kpuu", "k(p,uu,brain)", "k(p,uu,csf)", "bpr", "bbr",
               "ratio", "ratio auc", "brain/plasma ratio", "b/p ratio",
               "brain-plasma ratio", "brain:plasma ratio"}
LOGBB_TYPES = {"logbb", "log bb"}
CONC_TYPES = {"cmax", "cmin", "cavg", "css", "clast", "auc", "drug uptake",
              "concentration", "conc.", "conc"}
PAMPA_TYPES = {"permeability", "pe", "papp", "peff", "log pe", "logpe", "logpapp",
               "log papp", "logp app", "logpeff", "log peff", "log(permeability)"}
LOG_PAMPA_TYPES = {"log pe", "logpe", "logpapp", "log papp", "logp app",
                   "logpeff", "log peff", "log(permeability)"}


def classify_activity(standard_type: str | None, assay_desc: str) -> str | None:
    """Return 'kp' | 'pampa_pe' | 'csf_conc' | None.

    'csf_conc' is a human CNS concentration; the caller maps it to measure 'csf'.
    """
    desc = assay_desc if isinstance(assay_desc, str) else ""
    if is_predicted_desc(desc):
        return None  # predicted/calculated values are never measured evidence
    if _BINDING.search(desc):
        return None  # ex-vivo binding readout (e.g. plaque signal-to-noise), not exposure
    st = (standard_type if isinstance(standard_type, str) else "").strip().lower()
    # 'blood-brain barrier' contains the word 'brain' but is not a brain-tissue readout
    brain = bool(_BRAIN.search(_BBB.sub(" ", desc).lower()))
    pampa_bbb = bool(_PAMPA.search(desc)) and bool(_BBB.search(desc))
    if st in RATIO_TYPES:
        if brain:
            return "kp"
        if mentions_csf(desc):
            return "csf_conc"  # CSF ratio without brain wording -> measure 'csf'
        return None  # e.g. BPR 'blood to plasma ratio in human'
    if st in LOGBB_TYPES:
        if pampa_bbb and not brain:
            return "pampa_pe"  # logBB-typed PAMPA readout; conversion still 10^v
        if brain:
            return "kp"
        if mentions_csf(desc):
            return "csf_conc"
        return None
    if st in PAMPA_TYPES:
        return "pampa_pe" if pampa_bbb else None
    if st in CONC_TYPES:
        # concentrations only count with a CNS compartment in the description
        if mentions_csf(desc) or brain:
            return "csf_conc"
        return None
    return None


def kp_from_row(value: float, standard_type: str, assay_desc: str) -> float | None:
    """Brain ratio, handling % units, logBB and inverted (blood-to-brain) rows."""
    if value is None:
        return None
    st = (standard_type or "").strip().lower()
    if st in LOGBB_TYPES:
        kp = logbb_to_kp(value)
    else:
        kp = float(value)
    if kp is None:
        return None
    if _INVERTED.search(assay_desc or ""):
        if kp == 0:
            return None
        kp = 1.0 / kp
    return kp


def survives(level: str, measure: str, value: float | None) -> bool | None:
    """Truth-table survive rule; None when not evaluable."""
    if value is None:
        return None
    if level == "measured_human_cns":
        return True  # measured human CNS PK presence alone survives
    if measure == "kp":
        return value >= KP_SURVIVE
    if measure == "pampa_pe":
        return value >= PE_SURVIVE
    return None


# --- predicted (RDKit physchem) ----------------------------------------------
def physchem(smiles: str | None) -> dict | None:
    if not smiles:
        return None
    try:
        from rdkit import Chem
        from rdkit.Chem import Crippen, Descriptors
    except ImportError:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    return {"tpsa": Descriptors.TPSA(mol), "mw": Descriptors.MolWt(mol),
            "hbd": Descriptors.NumHDonors(mol), "clogp": Crippen.MolLogP(mol)}


def predict_cns_penetrant(tpsa: float, mw: float, hbd: int, clogp: float) -> bool:
    """Pajouhesh & Lenz 2005 style rule. Labelled 'predicted', never measured."""
    return bool(tpsa <= 90 and mw <= 450 and hbd <= 3 and 1 <= clogp <= 5)


# --- ChEMBL querying ----------------------------------------------------------
def chembl_connect() -> sqlite3.Connection:
    if not CHEMBL_DB.exists():
        raise FileNotFoundError(f"ChEMBL SQLite not extracted ({CHEMBL_DB})")
    con = sqlite3.connect(f"file:{CHEMBL_DB}?mode=ro", uri=True)
    con.execute("pragma temp_store=memory")
    return con


def molregnos_for(con: sqlite3.Connection, chembl_ids: list[str]) -> dict[str, int]:
    rows = con.execute(
        f"select chembl_id, molregno from molecule_dictionary where chembl_id in "
        f"({','.join('?' * len(chembl_ids))})", chembl_ids).fetchall()
    return {c: m for c, m in rows}


def expand_salts(con: sqlite3.Connection, molregnos: set[int]) -> set[int]:
    """Include salt/prodrug forms whose parent is one of the given molregnos."""
    if not molregnos:
        return set()
    ph = ",".join("?" * len(molregnos))
    kids = con.execute(
        f"select molregno from molecule_hierarchy where parent_molregno in ({ph})",
        sorted(molregnos)).fetchall()
    return set(molregnos) | {k[0] for k in kids}


PREFILTER_TYPES = sorted(RATIO_TYPES | LOGBB_TYPES | CONC_TYPES | PAMPA_TYPES)


def fetch_candidate_activities(con: sqlite3.Connection, molregnos: set[int]) -> pd.DataFrame:
    """All plausibly-CNS activities for the given molregnos (final call in Python)."""
    if not molregnos:
        return pd.DataFrame()
    mph = ",".join("?" * len(molregnos))
    tph = ",".join("?" * len(PREFILTER_TYPES))
    q = f"""
    select md.chembl_id as mol_chembl, a.standard_type, a.standard_value, a.standard_units,
           a.standard_relation, a.data_validity_comment, ay.description, ay.assay_organism,
           td.organism as target_organism
    from activities a
    join molecule_dictionary md on md.molregno = a.molregno
    join assays ay on ay.assay_id = a.assay_id
    left join target_dictionary td on td.tid = ay.tid
    where a.molregno in ({mph})
      and (lower(a.standard_type) in ({tph})
           or lower(ay.description) like '%pampa%'
           or lower(ay.description) like '%cerebrospinal%'
           or lower(ay.description) like '%csf%'
           or (lower(ay.description) like '%brain%' and
               (lower(ay.description) like '%plasma%' or lower(ay.description) like '%blood%')))
    """
    params: list = sorted(molregnos) + PREFILTER_TYPES
    return pd.read_sql_query(q, con, params=params)


def _s(x) -> str:
    """NaN-safe string coercion (pandas may return float NaN for missing TEXT)."""
    return "" if pd.isna(x) else str(x)


def is_human_row(assay_organism, target_organism) -> bool:
    return _s(assay_organism) == "Homo sapiens" or _s(target_organism) == "Homo sapiens"


def build_measured(acts: pd.DataFrame, molregno_owner: dict[int, str]) -> pd.DataFrame:
    """Classify + aggregate candidate activities to one row per (pert_id, measure).

    molregno_owner maps mol_chembl -> pert_id of the drug whose family it belongs to.
    Returns rows with level measured_human_cns | measured_preclinical.
    """
    recs = []
    examples: dict[str, list[str]] = {"kp": [], "pampa_pe": [], "csf": []}
    if acts.empty:
        out = pd.DataFrame(columns=["pert_id", "level", "measure", "value", "unit",
                                    "is_measured", "summary", "source_url"])
        return out, examples
    for rec in acts.itertuples():
        if pd.notna(rec.data_validity_comment):
            continue  # flagged assays are dropped (NaN-safe: missing stays missing)
        if rec.standard_relation not in ("=", ">"):
            continue
        if pd.isna(rec.standard_value):
            continue
        kind = classify_activity(_s(rec.standard_type) or None, _s(rec.description))
        if kind is None:
            continue
        human = is_human_row(rec.assay_organism, rec.target_organism)
        try:
            val = float(rec.standard_value)
        except (TypeError, ValueError):
            continue
        if isinstance(val, float) and math.isnan(val):
            continue
        inverted = bool(_INVERTED.search(_s(rec.description)))
        if kind == "kp":
            kp = kp_from_row(val, _s(rec.standard_type), _s(rec.description))
            if kp is None:
                continue
            if inverted and rec.standard_relation != "=":
                continue  # inverted bound is an upper bound; unusable
            unit = "ratio"
            if _s(rec.standard_units).strip() == "%":
                kp = kp / 100.0
            measure, value = "kp", kp
        elif kind == "pampa_pe":
            st = _s(rec.standard_type).strip().lower()
            if st in LOG_PAMPA_TYPES:
                pe = logbb_to_kp(val)  # log10(Pe in cm/s) assumption, flagged
                logscale = True
            else:
                pe = normalise_pe_to_cm_s(val, _s(rec.standard_units) or None)
                logscale = False
            if pe is None:
                continue
            measure, value, unit = "pampa_pe", pe, "cm/s"
        else:  # csf_conc
            raw_unit = _s(rec.standard_units)
            if not raw_unit:
                raw_unit = ("ratio" if _s(rec.standard_type).strip().lower()
                            in RATIO_TYPES | LOGBB_TYPES else "unspecified")
            measure, value, unit = "csf", val, raw_unit
        level = "measured_human_cns" if human else "measured_preclinical"
        recs.append({"pert_id": molregno_owner.get(_s(rec.mol_chembl)), "level": level,
                     "measure": measure, "value": value, "unit": unit,
                     "relation": rec.standard_relation,
                     "organism": _s(rec.assay_organism) or _s(rec.target_organism) or "unspecified",
                     "desc": _s(rec.description),
                     "logscale": bool(locals().get("logscale", False)),
                     "inverted": inverted})
        if len(examples.get(measure, [])) < 50:
            examples.setdefault(measure, []).append(_s(rec.description))
    df = pd.DataFrame(recs)
    if df.empty:
        return df, examples
    df = df[df["pert_id"].notna()]
    rows = []
    for (pert, measure), g in df.groupby(["pert_id", "measure"]):
        g = g.sort_values("value")
        level = "measured_human_cns" if (g["level"] == "measured_human_cns").any() else "measured_preclinical"
        gh = g[g["level"] == level]
        med = float(gh["value"].median())
        n_eq = int((gh["relation"] == "=").sum())
        n_gt = int((gh["relation"] == ">").sum())
        orgs = sorted(set(gh["organism"].tolist()))
        extra = []
        if bool(gh["inverted"].any()):
            extra.append("blood-to-brain rows inverted to brain:blood")
        if bool(gh["logscale"].any()):
            extra.append("log-scale Pe assumed log10(Pe in cm/s)")
        surv = survives(level, measure, med)
        summary = (f"median of {len(gh)} measured value(s) (n_eq={n_eq}, n_gt={n_gt}; "
                   f"organism={'+'.join(orgs)}; "
                   f"survive_rule={'survive' if surv else 'fail' if surv is False else 'n/a'}"
                   + ("; " + "; ".join(extra) if extra else "") + ")")
        rows.append({"pert_id": pert, "level": level, "measure": measure, "value": med,
                     "unit": str(gh["unit"].iloc[0]), "is_measured": True,
                     "summary": summary, "source_url": None})
    return pd.DataFrame(rows), examples


def build_predicted(drug_smiles: pd.DataFrame) -> pd.DataFrame:
    """predicted_mpo row per drug with a computable RDKit profile."""
    rows = []
    for rec in drug_smiles.itertuples():
        pc = physchem(getattr(rec, "smiles", None))
        if pc is None:
            continue
        penetrant = predict_cns_penetrant(pc["tpsa"], pc["mw"], pc["hbd"], pc["clogp"])
        summary = ("predicted CNS-penetrant" if penetrant else "predicted non-penetrant"
                   + f" by Pajouhesh-Lenz style rule (TPSA<=90, MW<=450, HBD<=3, 1<=cLogP<=5): "
                     f"TPSA={pc['tpsa']:.1f}, MW={pc['mw']:.0f}, HBD={pc['hbd']}, cLogP={pc['clogp']:.2f}. "
                     "Labelled predicted, never measured.")
        rows.append({"pert_id": rec.pert_id, "level": "predicted", "measure": "predicted_mpo",
                     "value": 1.0 if penetrant else 0.0, "unit": "binary",
                     "is_measured": False, "summary": summary,
                     "source_url": chembl_card_url(rec.chembl_id)})
    return pd.DataFrame(rows, columns=["pert_id", "level", "measure", "value", "unit",
                                       "is_measured", "summary", "source_url"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    ap.add_argument("--chembl", default=str(CHEMBL_DB))
    args = ap.parse_args()

    pool = pd.read_parquet(PROCESSED / "scores" / f"{args.ranking}__candidate_pool.parquet")
    scope = pool[pool["pool"].isin(["benchmark", "development"])].copy()
    drug_map = pd.read_parquet(PROCESSED / "evidence" / "drug_map.parquet")
    scope = scope.merge(drug_map[["pert_id", "chembl_id", "parent_chembl_id"]],
                        on="pert_id", how="left", suffixes=("", "_dm"))
    scope["chembl_id"] = scope["chembl_id_dm"].fillna(scope["chembl_id"])
    compounds = pd.read_parquet(PROCESSED / "lincs" / "compounds.parquet")
    smiles = compounds.set_index("pert_id")["canonical_smiles"].to_dict()

    measured = pd.DataFrame()
    examples: dict[str, list[str]] = {}
    chembl_ok = Path(args.chembl).exists()
    if chembl_ok:
        con = sqlite3.connect(f"file:{args.chembl}?mode=ro", uri=True)
        chembl_ids = sorted({c for c in scope["chembl_id"].tolist() if isinstance(c, str)}
                            | {p for p in scope["parent_chembl_id"].tolist() if isinstance(p, str)})
        mol = molregnos_for(con, chembl_ids)  # chembl_id -> molregno
        chembl_of = dict(zip(scope["chembl_id"], scope["pert_id"], strict=True))
        parent_of = {p: pert for p, pert in zip(scope["parent_chembl_id"], scope["pert_id"],
                                                     strict=True)
                     if isinstance(p, str)}
        fams = expand_salts(con, set(mol.values()))
        acts = fetch_candidate_activities(con, fams)
        acts_owner = {c: (chembl_of.get(c, parent_of.get(c)))
                      for c in acts["mol_chembl"].unique()} if len(acts) else {}
        measured, examples = build_measured(acts, acts_owner)
        # ChEMBL SMILES preferred for prediction; fall back to LINCS
        smiles_rows = con.execute(
            "select md.chembl_id, cs.canonical_smiles from compound_structures cs "
            "join molecule_dictionary md on md.molregno = cs.molregno "
            f"where md.chembl_id in ({','.join('?' * len(chembl_ids))})", chembl_ids).fetchall()
        chem_smiles = {c: s for c, s in smiles_rows if s}
        con.close()
    else:
        chem_smiles = {}

    drug_smiles = pd.DataFrame(
        [{"pert_id": r.pert_id, "chembl_id": r.chembl_id,
          "smiles": chem_smiles.get(r.chembl_id) or smiles.get(r.pert_id)}
         for r in scope.itertuples()])
    predicted = build_predicted(drug_smiles)
    if not measured.empty:
        chembl_by_pert = dict(zip(scope["pert_id"], scope["chembl_id"], strict=True))
        measured["source_url"] = measured["pert_id"].map(chembl_by_pert).map(
            lambda c: chembl_card_url(c) if isinstance(c, str) else None)
    exposure = pd.concat([measured, predicted], ignore_index=True)
    exposure = exposure.sort_values(["pert_id", "level", "measure"]).reset_index(drop=True)

    out_path = processed("evidence", "exposure.parquet")
    exposure.to_parquet(out_path, index=False)
    ex_summary = {k: sorted(set(v))[:5] for k, v in examples.items()}
    Provenance(
        step="exposure",
        dataset_accession=["ChEMBL-37", "GSE92742", "GSE70138"],
        inputs=raw_inputs(Path(str(CHEMBL_DB).split("/raw/")[1])) if chembl_ok else {},
        gene_mapping_version="n/a",
        parameters={"ranking": args.ranking, "scope": "pool ranks 1-100",
                    "chembl_available": chembl_ok,
                    "kp_survive": KP_SURVIVE, "pe_survive_cm_s": PE_SURVIVE,
                    "cns_rule": "TPSA<=90 & MW<=450 & HBD<=3 & 1<=cLogP<=5",
                    "relations_kept": ["=", ">"], "dropped": "data_validity_comment flagged, predicted descs",
                    "example_assays": ex_summary,
                    "level_counts": exposure["level"].value_counts().to_dict()},
        random_seed=None,
    ).write(out_path)
    print({"chembl": chembl_ok, "rows": len(exposure),
           "levels": exposure["level"].value_counts().to_dict() if len(exposure) else {}})
    print(json.dumps(ex_summary, indent=1)[:3000])


if __name__ == "__main__":
    main()
