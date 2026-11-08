"""Typeahead index for GET /compounds/search (My compounds picker).

Covers every name POST /lookup understands: all LINCS compounds
(lincs/compounds.parquet), clinical names linked to LINCS (evidence/drug_map.parquet),
the ChEMBL / AACT trade-name and synonym index from pipelines.evidence.lookup, and
ChEMBL drugs with no LINCS match (status not_in_lincs). Rank and reversal score come
from the preregistered GSE132903 ranking only; nothing held out is read here.

Invariant: each row's `name`, sent to POST /lookup, resolves to that same row, so a
chip picked from the dropdown checks exactly as shown.

Matching on the normalised query (lowercase, non-alphanumerics stripped): exact name
or alias, then prefix, then substring (3+ characters). Within a tier, named compounds
come before bare BRD codes (15,876 LINCS compounds have only a BRD id as their name;
they stay searchable by it), then ranked rows in rank order, then not rankable, then
not in LINCS, alphabetically.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import pandas as pd

_RANKING_NAME = "GSE132903__main"
_GROUP = {"ranked": 0, "not_rankable": 1, "not_in_lincs": 2}
MIN_SUBSTRING = 3
_BRD_CODE = re.compile(r"^BRD-[A-Z]\d", re.IGNORECASE)


def normalize(name: object) -> str:
    """Same key as pipelines.evidence.lookup.normalize (kept here so mock mode needs no pipelines)."""
    if not isinstance(name, str):
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def display(name: object) -> str:
    """Same casing as lookup._display: title-case plain names, keep codes with digits."""
    text = str(name)
    return text if any(ch.isdigit() for ch in text) else text.title()


@dataclass(frozen=True)
class Row:
    id: str
    name: str
    status: str
    pool_rank: int | None = None
    rank_total: int | None = None
    consensus: float | None = None
    rank: int | None = None  # global ranking order, sort only

    def order(self) -> tuple:
        return (
            bool(_BRD_CODE.match(self.name)),  # named compounds before bare BRD codes
            _GROUP[self.status],
            self.rank if self.rank is not None else 0,
            self.name.lower(),
        )

    def payload(self, alias: str | None) -> dict:
        out: dict = {"id": self.id, "name": self.name, "status": self.status}
        if self.pool_rank is not None:
            out["pool_rank"] = self.pool_rank
            out["rank_total"] = self.rank_total
        if self.consensus is not None:
            out["consensus"] = self.consensus
        if alias:
            out["matched_alias"] = alias
        return out


@dataclass
class SearchIndex:
    rows: list[Row] = field(default_factory=list)
    # (normalised key, row index, alias label or None when the key is the row's own name)
    entries: list[tuple[str, int, str | None]] = field(default_factory=list)

    def add_row(self, row: Row, aliases: dict[str, str] | None = None) -> int:
        i = len(self.rows)
        self.rows.append(row)
        self.entries.append((normalize(row.name), i, None))
        for key, label in (aliases or {}).items():
            if key and key != normalize(row.name):
                self.entries.append((key, i, label))
        return i


def search(index: SearchIndex, q: str, limit: int = 20) -> list[dict]:
    nq = normalize(q)
    if not nq or limit <= 0:
        return []
    substring = len(nq) >= MIN_SUBSTRING
    best: dict[int, tuple[int, bool, int, str | None]] = {}
    for key, i, alias in index.entries:
        if key == nq:
            tier = 0
        elif key.startswith(nq):
            tier = 1
        elif substring and nq in key:
            tier = 2
        else:
            continue
        cand = (tier, alias is not None, len(key), alias)
        prev = best.get(i)
        if prev is None or cand[:3] < prev[:3]:
            best[i] = cand
    ranked = sorted(best.items(), key=lambda kv: (kv[1][0], index.rows[kv[0]].order()))
    return [index.rows[i].payload(m[3]) for i, m in ranked[:limit]]


# ----------------------------------------------------------------------------
# Mock mode: rows from contracts/fixtures/searchCompounds.json
# ----------------------------------------------------------------------------


def index_from_fixture(rows: list[dict]) -> SearchIndex:
    index = SearchIndex()
    for r in rows:
        row = Row(
            id=str(r["id"]),
            name=str(r["name"]),
            status=str(r["status"]),
            pool_rank=r.get("pool_rank"),
            rank_total=r.get("rank_total"),
            consensus=r.get("consensus"),
            rank=r.get("pool_rank"),
        )
        index.add_row(row, {normalize(a): a for a in r.get("aliases", [])})
    return index


# ----------------------------------------------------------------------------
# Real mode: built once per set of input files
# ----------------------------------------------------------------------------


def _stamp(base: Path) -> tuple:
    from pipelines.evidence import lookup as lookup_mod

    rels = [
        f"scores/{_RANKING_NAME}__compound_ranking.parquet",
        f"scores/{_RANKING_NAME}__candidate_pool.parquet",
        "lincs/compounds.parquet",
        "evidence/drug_map.parquet",
    ]
    paths = [base / r for r in rels]
    ot = sorted(lookup_mod.OT_DIR.glob("drug_molecule*/*.parquet")) or [lookup_mod.OT_SLIM_PATH]
    return tuple((str(p), p.stat().st_mtime_ns if p.exists() else 0) for p in paths + ot)


def index_for(base: Path) -> SearchIndex:
    return _index_cached(str(base), _stamp(base))


@lru_cache(maxsize=2)
def _index_cached(base: str, _stamp: tuple) -> SearchIndex:
    from app.services.drug_detail import _need_frame

    root = Path(base)
    return build_index(
        compounds=_need_frame(root, "lincs/compounds.parquet"),
        drug_map=_need_frame(root, "evidence/drug_map.parquet"),
        ranking=_need_frame(root, f"scores/{_RANKING_NAME}__compound_ranking.parquet"),
        pool=_need_frame(root, f"scores/{_RANKING_NAME}__candidate_pool.parquet"),
    )


def _ot_raw_labels(rec, chembl_only: bool = False) -> list[str]:
    from pipelines.evidence import lookup as lookup_mod

    out = []
    name = getattr(rec, "name", None)
    if isinstance(name, str) and name:
        out.append(name)
    for col in ("tradeNames", "synonyms"):
        values = getattr(rec, col, None)
        if values is None:
            continue
        for item in list(values):
            label, source = lookup_mod._label(item)
            if isinstance(label, str) and label and not (chembl_only and source.upper() == "AACT"):
                out.append(label)
    return out


def build_index(
    compounds: pd.DataFrame,
    drug_map: pd.DataFrame,
    ranking: pd.DataFrame,
    pool: pd.DataFrame,
    ot_molecule: pd.DataFrame | None = None,
    use_ot: bool = True,
) -> SearchIndex:
    """Rows mirror what POST /lookup returns for each name (status, name, rank, score)."""
    from pipelines.evidence import lookup as lookup_mod

    ranked_ids = set(ranking["pert_id"].astype(str))
    if ot_molecule is None and use_ot:
        # The exact name -> pert_id map POST /lookup uses, from the same cache.
        name_index = lookup_mod._cached_index(compounds, drug_map, ranked_ids)[0]
        ot_molecule = lookup_mod.load_ot_molecule()
    else:
        name_index = lookup_mod.build_index(compounds, drug_map, ot_molecule, ranked_ids)
    ot = ot_molecule if ot_molecule is not None and len(ot_molecule) > 0 else None

    labels: dict[str, str] = {}

    def remember(raw: object) -> None:
        key = normalize(raw)
        if key and key not in labels:
            labels[key] = display(raw)

    for v in compounds["pert_iname"]:
        remember(v)
    for v in drug_map["drug_name"]:
        remember(v)
    if ot is not None:
        for rec in ot.itertuples():
            for label in _ot_raw_labels(rec):
                remember(label)

    rank_by = {str(r.pert_id): r for r in ranking.itertuples()}
    pool_by = {str(r.pert_id): r for r in pool.itertuples()}
    rank_total = int(len(pool))
    iname = {str(p): str(n) for p, n in zip(compounds["pert_id"], compounds["pert_iname"], strict=True)}

    keys_by_pid: dict[str, dict[str, str]] = {}
    for key, pid in name_index.items():
        keys_by_pid.setdefault(pid, {})[key] = labels.get(key, key)

    index = SearchIndex()
    for pid, n in iname.items():
        keys = keys_by_pid.get(pid)
        if not keys:
            continue  # duplicate BRD id: its name resolves to another pert_id
        rrow = rank_by.get(pid)
        prow = pool_by.get(pid)
        name = (
            display(prow.drug_name)
            if rrow is not None and prow is not None and not pd.isna(prow.drug_name)
            else display(n)
        )
        if normalize(name) not in keys:
            name = display(n)
            if normalize(name) not in keys:
                continue
        if rrow is None:
            row = Row(id=pid, name=name, status="not_rankable")
        else:
            row = Row(
                id=pid,
                name=name,
                status="ranked",
                pool_rank=int(prow.pool_rank) if prow is not None else None,
                rank_total=rank_total if prow is not None else None,
                consensus=float(rrow.consensus_median),
                rank=int(rrow.rank),
            )
        index.add_row(row, keys)

    if ot is not None:
        _add_unlinked(index, ot, set(name_index))
    return index


def _add_unlinked(index: SearchIndex, ot: pd.DataFrame, linked: set[str]) -> None:
    """ChEMBL drugs POST /lookup knows but cannot match to LINCS (status not_in_lincs).

    Salts fold into their parent (one row per family, id = parent ChEMBL id). Only
    ChEMBL-source labels are indexed, and a label two families share is skipped.
    """
    parent_name: dict[str, str] = {}
    for rec in ot.itertuples():
        parent = getattr(rec, "parentId", None)
        if not (isinstance(parent, str) and parent) and isinstance(rec.name, str):
            parent_name[str(rec.id)] = rec.name
    families: dict[str, dict[str, str]] = {}
    owners: dict[str, set[str]] = {}
    for rec in ot.itertuples():
        parent = getattr(rec, "parentId", None)
        family = parent if isinstance(parent, str) and parent else str(rec.id)
        for label in _ot_raw_labels(rec, chembl_only=True):
            key = normalize(label)
            if not key or key in linked:
                continue
            families.setdefault(family, {}).setdefault(key, display(label))
            owners.setdefault(key, set()).add(family)
    for family, keys in families.items():
        own = {k: v for k, v in keys.items() if len(owners[k]) == 1}
        raw_name = parent_name.get(family)
        name_key = normalize(raw_name)
        if not raw_name or name_key not in own:
            if not own:
                continue
            name_key = min(own, key=len)  # parent missing or not unique: shortest own label
            raw_name = own[name_key]
        index.add_row(Row(id=family, name=display(raw_name), status="not_in_lincs"), own)
