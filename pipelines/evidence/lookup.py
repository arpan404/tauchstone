"""Name lookup index over LINCS compounds, drug_map and OT synonyms (Track D1).

Matching is case/hyphen/space-insensitive: names are normalised by lowercasing
and stripping every non-alphanumeric character. Lookup is exact on the
normalised form (no substring matching), and results keep the input order.

Status per query:
  ranked        - in scores/...__compound_ranking.parquet (>= 3 ranking contexts)
  not_rankable  - in LINCS (lincs/compounds.parquet) but below the rank cutoff
  not_in_lincs  - no LINCS match at all
"""

from __future__ import annotations

import argparse
import json
import re

import pandas as pd

from pipelines.common.paths import PROCESSED
from pipelines.evidence._common import OT_DIR

_RANKING_NAME = "GSE132903__main"


def normalize(name: object) -> str:
    """Case/hyphen/space-insensitive key. Non-strings normalise to ''."""
    if not isinstance(name, str):
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _add(index: dict[str, str], raw_name: object, pert_id: str) -> None:
    key = normalize(raw_name)
    if key and key not in index:
        index[key] = pert_id


def build_index(
    compounds: pd.DataFrame,
    drug_map: pd.DataFrame,
    ot_molecule: pd.DataFrame | None = None,
    ranked_ids: set[str] | None = None,
) -> dict[str, str]:
    """Normalised name -> pert_id. Ranked compounds win on collision."""
    ranked_ids = ranked_ids or set()
    index: dict[str, str] = {}
    is_ranked = compounds["pert_id"].astype(str).isin(ranked_ids)
    ordered = pd.concat([compounds[is_ranked], compounds[~is_ranked]])
    for rec in ordered.itertuples():
        _add(index, getattr(rec, "pert_iname", None), str(rec.pert_id))
    for rec in drug_map.itertuples():
        _add(index, getattr(rec, "drug_name", None), str(rec.pert_id))
    synonym_targets: dict[str, set[str]] = {}
    if ot_molecule is not None and len(ot_molecule):
        chembl_to_pert = {
            str(r.chembl_id): str(r.pert_id)
            for r in drug_map.itertuples()
            if isinstance(getattr(r, "chembl_id", None), str)
        }
        parent_to_pert = {
            str(r.parent_chembl_id): str(r.pert_id)
            for r in drug_map.itertuples()
            if isinstance(getattr(r, "parent_chembl_id", None), str)
        }
        for rec in ot_molecule.itertuples():
            chembl_id = str(getattr(rec, "id", ""))
            parent = getattr(rec, "parentId", None)
            family = parent if isinstance(parent, str) and parent else chembl_id  # salt -> parent drug
            pert_id = (chembl_to_pert.get(chembl_id) or parent_to_pert.get(chembl_id)
                       or chembl_to_pert.get(family) or parent_to_pert.get(family))
            # Unlinked records still count when checking whether a synonym is ambiguous.
            target = pert_id if pert_id is not None else f"chembl:{family}"
            if pert_id is not None:
                _add(index, getattr(rec, "name", None), pert_id)
            else:
                name_key = normalize(getattr(rec, "name", None))
                if name_key:
                    synonym_targets.setdefault(name_key, set()).add(target)
            for field in ("synonyms", "tradeNames"):
                values = getattr(rec, field, None)
                if values is None:
                    continue
                for item in list(values):
                    key = normalize(item.get("label") if isinstance(item, dict) else item)
                    if key:
                        synonym_targets.setdefault(key, set()).add(target)
        # Synonyms only fill gaps, and only when they point to exactly one compound: source synonym
        # lists contain errors (e.g. a donepezil brand listed under rivastigmine), and a real name
        # must never be overridden by a synonym.
        for key, targets in synonym_targets.items():
            only = next(iter(targets))
            if key not in index and len(targets) == 1 and not only.startswith("chembl:"):
                index[key] = only
    return index


def load_ot_molecule() -> pd.DataFrame | None:
    """OT drug_molecule raw table (synonyms source); None when not downloaded."""
    files = sorted(OT_DIR.glob("drug_molecule*/*.parquet"))
    if not files:
        return None
    try:
        frames = [pd.read_parquet(f, columns=["id", "name", "synonyms", "tradeNames", "parentId"]) for f in files]
    except (OSError, ValueError):
        return None
    return pd.concat(frames, ignore_index=True)


def lookup(
    names: list[str],
    ranking: pd.DataFrame | None = None,
    pool: pd.DataFrame | None = None,
    compounds: pd.DataFrame | None = None,
    drug_map: pd.DataFrame | None = None,
    truth: pd.DataFrame | None = None,
    index: dict[str, str] | None = None,
) -> list[dict]:
    """LookupResult rows in input order. Frames default to the processed tables."""
    base = PROCESSED
    if ranking is None:
        ranking = pd.read_parquet(base / "scores" / f"{_RANKING_NAME}__compound_ranking.parquet")
    if pool is None:
        pool = pd.read_parquet(base / "scores" / f"{_RANKING_NAME}__candidate_pool.parquet")
    if compounds is None:
        compounds = pd.read_parquet(base / "lincs" / "compounds.parquet")
    if drug_map is None:
        drug_map = pd.read_parquet(base / "evidence" / "drug_map.parquet")
    if truth is None:
        truth = pd.read_parquet(base / "tauchstone" / "truth_table.parquet")
    if index is None:
        ranked_ids = set(ranking["pert_id"].astype(str).tolist())
        index = build_index(compounds, drug_map, load_ot_molecule(), ranked_ids)

    rank_by_pert = {str(r.pert_id): r for r in ranking.itertuples()}
    pool_by_pert = {str(r.pert_id): r for r in pool.itertuples()}
    compound_names = {str(r.pert_id): str(r.pert_iname) for r in compounds.itertuples()}
    attack_ready = set(truth["candidate_id"].astype(str).tolist())
    rank_total = len(pool)

    out = []
    for query in names:
        pid = index.get(normalize(query))
        if pid is None:
            out.append(
                {
                    "query": query,
                    "status": "not_in_lincs",
                    "drug_id": None,
                    "name": None,
                    "pool_rank": None,
                    "rank_total": None,
                    "consensus": None,
                    "n_contexts": None,
                    "attack_ready": False,
                    "preregistered": False,
                }
            )
            continue
        rrow = rank_by_pert.get(pid)
        if rrow is None:
            out.append(
                {
                    "query": query,
                    "status": "not_rankable",
                    "drug_id": pid,
                    "name": compound_names.get(pid, pid),
                    "pool_rank": None,
                    "rank_total": None,
                    "consensus": None,
                    "n_contexts": None,
                    "attack_ready": False,
                    "preregistered": False,
                }
            )
            continue
        prow = pool_by_pert.get(pid)
        out.append(
            {
                "query": query,
                "status": "ranked",
                "drug_id": pid,
                "name": (
                    str(prow.drug_name).title()
                    if prow is not None and not pd.isna(prow.drug_name)
                    else compound_names.get(pid, pid)
                ),
                "pool_rank": int(prow.pool_rank) if prow is not None else None,
                "rank_total": rank_total if prow is not None else None,
                "consensus": float(rrow.consensus_median),
                "n_contexts": int(rrow.n_ranking_contexts),
                "attack_ready": bool(pid in attack_ready),
                "preregistered": bool(pid in attack_ready),
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="+")
    args = ap.parse_args()
    print(json.dumps(lookup(args.names), indent=1))


if __name__ == "__main__":
    main()
