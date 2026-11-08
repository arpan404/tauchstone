"""Name lookup index over LINCS compounds, drug_map and OT synonyms (Track D1).

Matching is case/hyphen/space-insensitive: names are normalised by lowercasing
and stripping every non-alphanumeric character. Lookup is exact on the
normalised form (no substring matching), and results keep the input order.

Status per query:
  ranked        - in scores/...__compound_ranking.parquet (>= 3 ranking contexts)
  not_rankable  - in LINCS (lincs/compounds.parquet) but below the rank cutoff
  not_in_lincs  - a known compound name (OT/ChEMBL/AACT) with no LINCS match
  unrecognized  - no source knows the name at all
"""

from __future__ import annotations

import argparse
import json
import re

import pandas as pd

from pipelines.common.paths import PROCESSED
from pipelines.evidence._common import OT_DIR

_RANKING_NAME = "GSE132903__main"


def _display(name: object) -> str:
    """Title-case plain names; keep codes with digits as written (LY-2886721)."""
    text = str(name)
    return text if any(ch.isdigit() for ch in text) else text.title()


def normalize(name: object) -> str:
    """Case/hyphen/space-insensitive key. Non-strings normalise to ''."""
    if not isinstance(name, str):
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _add(index: dict[str, str], raw_name: object, pert_id: str) -> None:
    key = normalize(raw_name)
    if key and key not in index:
        index[key] = pert_id


def _label(item: object) -> tuple[object, str]:
    """(label, source) for an OT synonym entry; plain strings count as ChEMBL."""
    if isinstance(item, dict):
        return item.get("label"), str(item.get("source") or "ChEMBL")
    return item, "ChEMBL"


def _ot_labels(rec) -> list[tuple[str, bool]]:
    """Normalised (key, is_aact) for a molecule's name, synonyms and trade names."""
    out = []
    name_key = normalize(getattr(rec, "name", None))
    if name_key:
        out.append((name_key, False))
    for field in ("tradeNames", "synonyms"):
        values = getattr(rec, field, None)
        if values is None:
            continue
        for item in list(values):
            label, source = _label(item)
            key = normalize(label)
            if key:
                out.append((key, source.upper() == "AACT"))
    return out


def known_names(ot_molecule: pd.DataFrame | None) -> set[str]:
    """Every normalised name, synonym or trade name the OT molecule table knows."""
    if ot_molecule is None or not len(ot_molecule):
        return set()
    return {key for rec in ot_molecule.itertuples() for key, _ in _ot_labels(rec)}


def build_index(
    compounds: pd.DataFrame,
    drug_map: pd.DataFrame,
    ot_molecule: pd.DataFrame | None = None,
    ranked_ids: set[str] | None = None,
) -> dict[str, str]:
    """Normalised name -> pert_id. Ranked compounds win on collision.

    Names come in tiers; a later tier never overrides an earlier one:
      1. LINCS pert_iname and drug_map names
      2. ChEMBL-source OT names, trade names and synonyms (salt -> parent via parentId)
      3. AACT-source OT labels, only for keys ChEMBL never mentions
    Tiers 2 and 3 only map a key that points to exactly one compound: AACT lists contain
    errors (e.g. 'aricept' under rivastigmine), and an ambiguous name is never guessed.
    """
    ranked_ids = ranked_ids or set()
    index: dict[str, str] = {}
    is_ranked = compounds["pert_id"].astype(str).isin(ranked_ids)
    ordered = pd.concat([compounds[is_ranked], compounds[~is_ranked]])
    for rec in ordered.itertuples():
        _add(index, getattr(rec, "pert_iname", None), str(rec.pert_id))
    map_ranked = drug_map["pert_id"].astype(str).isin(ranked_ids)
    map_ordered = pd.concat([drug_map[map_ranked], drug_map[~map_ranked]])
    for rec in map_ordered.itertuples():
        _add(index, getattr(rec, "drug_name", None), str(rec.pert_id))
    if ot_molecule is None or not len(ot_molecule):
        return index
    # One ChEMBL id can map to several LINCS ids (e.g. two memantine BRDs); ranked wins.
    chembl_to_pert: dict[str, str] = {}
    parent_to_pert: dict[str, str] = {}
    for r in map_ordered.itertuples():
        for col, target in (("chembl_id", chembl_to_pert), ("parent_chembl_id", parent_to_pert)):
            value = getattr(r, col, None)
            if isinstance(value, str) and value:
                target.setdefault(value, str(r.pert_id))
    chembl_targets: dict[str, set[str]] = {}
    aact_targets: dict[str, set[str]] = {}
    for rec in ot_molecule.itertuples():
        chembl_id = str(getattr(rec, "id", ""))
        parent = getattr(rec, "parentId", None)
        family = parent if isinstance(parent, str) and parent else chembl_id  # salt -> parent drug
        pert_id = (chembl_to_pert.get(chembl_id) or parent_to_pert.get(chembl_id)
                   or chembl_to_pert.get(family) or parent_to_pert.get(family))
        # Unlinked records still count when checking whether a name is ambiguous.
        target = pert_id if pert_id is not None else f"chembl:{family}"
        for key, is_aact in _ot_labels(rec):
            (aact_targets if is_aact else chembl_targets).setdefault(key, set()).add(target)
    for key, targets in chembl_targets.items():
        only = next(iter(targets))
        if key not in index and len(targets) == 1 and not only.startswith("chembl:"):
            index[key] = only
    for key, targets in aact_targets.items():
        only = next(iter(targets))
        if (key not in index and key not in chembl_targets and len(targets) == 1
                and not only.startswith("chembl:")):
            index[key] = only
    return index


OT_SLIM_PATH = PROCESSED / "evidence" / "ot_drug_molecule.parquet"


def load_ot_molecule() -> pd.DataFrame | None:
    """OT drug_molecule raw table (synonyms source); None when not downloaded.

    The offline demo bundle has no raw/ tree, so it carries these five columns as
    processed/evidence/ot_drug_molecule.parquet (written by scripts/make_demo_bundle.py).
    """
    files = sorted(OT_DIR.glob("drug_molecule*/*.parquet"))
    if not files:
        files = [p for p in [OT_SLIM_PATH] if p.exists()]
    if not files:
        return None
    try:
        frames = [pd.read_parquet(f, columns=["id", "name", "synonyms", "tradeNames", "parentId"]) for f in files]
    except (OSError, ValueError):
        return None
    return pd.concat(frames, ignore_index=True)


_INDEX_CACHE: dict[tuple, tuple[dict[str, str], set[str]]] = {}


def _frame_key(frame: pd.DataFrame) -> tuple:
    return (len(frame), int(pd.util.hash_pandas_object(frame.astype(str), index=False).sum()))


def _cached_index(
    compounds: pd.DataFrame, drug_map: pd.DataFrame, ranked_ids: set[str]
) -> tuple[dict[str, str], set[str]]:
    """Index + known names, rebuilt only when the input tables change (lookup runs per keystroke)."""
    ot_files = sorted(OT_DIR.glob("drug_molecule*/*.parquet")) or [p for p in [OT_SLIM_PATH] if p.exists()]
    key = (_frame_key(compounds[["pert_id", "pert_iname"]]), _frame_key(drug_map),
           hash(frozenset(ranked_ids)), tuple((str(f), f.stat().st_mtime_ns) for f in ot_files))
    hit = _INDEX_CACHE.get(key)
    if hit is None:
        ot = load_ot_molecule()
        index = build_index(compounds, drug_map, ot, ranked_ids)
        hit = (index, known_names(ot) | set(index))
        _INDEX_CACHE.clear()
        _INDEX_CACHE[key] = hit
    return hit


def lookup(
    names: list[str],
    ranking: pd.DataFrame | None = None,
    pool: pd.DataFrame | None = None,
    compounds: pd.DataFrame | None = None,
    drug_map: pd.DataFrame | None = None,
    truth: pd.DataFrame | None = None,
    index: dict[str, str] | None = None,
    known: set[str] | None = None,
) -> list[dict]:
    """LookupResult rows in input order. Frames default to the processed tables.

    ``known``: normalised names any source recognises; misses outside it are
    ``unrecognized``. Defaults to the OT molecule names when the index is built here,
    and to "every miss is not_in_lincs" when a prebuilt index is passed without it.
    """
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
        index, built_known = _cached_index(compounds, drug_map, ranked_ids)
        known = built_known if known is None else known

    rank_by_pert = {str(r.pert_id): r for r in ranking.itertuples()}
    pool_by_pert = {str(r.pert_id): r for r in pool.itertuples()}
    compound_names = {str(r.pert_id): str(r.pert_iname) for r in compounds.itertuples()}
    attack_ready = set(truth["candidate_id"].astype(str).tolist())
    rank_total = len(pool)

    out = []
    for query in names:
        key = normalize(query)
        pid = index.get(key)
        if pid is None:
            out.append(
                {
                    "query": query,
                    "status": "unrecognized" if known is not None and key not in known
                    else "not_in_lincs",
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
                    "name": _display(compound_names.get(pid, pid)),
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
                    _display(prow.drug_name)
                    if prow is not None and not pd.isna(prow.drug_name)
                    else _display(compound_names.get(pid, pid))
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
