"""Drug detail + compound lookup builders for GET /drugs/{id} and POST /lookup.

Pure functions over the processed tables; the repository methods delegate here
so mock and parquet modes share the derivation. Only RANKING contexts
(split == 'ranking') feed gaps and contexts -- held-out rows and measured
exposure values are hidden tests and never appear in these payloads.

`pipelines` is imported lazily: it is on PYTHONPATH under pytest and Docker
but not on the dev server's path (see services/api/Dockerfile).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

_RANKING_NAME = "GSE132903__main"
_NEURAL_CELLS = frozenset(
    {"SHSY5Y", "NEU", "NEU.KCL", "MNEU.E", "NPC", "NPC.CAS9", "NPC.TAK", "FIBRNPC"}
)


def display_name(name: object) -> str:
    """Readable drug name (mirrors repository.display_name without the import)."""
    s = str(name)
    return s if any(ch.isdigit() for ch in s) else s.title()


def _need_frame(base: Path, rel: str) -> pd.DataFrame:
    path = base / rel
    if not path.exists():
        from app.services.repository import NotFoundError

        raise NotFoundError(str(path))
    return pd.read_parquet(path)


def _maybe_frame(base: Path, rel: str) -> pd.DataFrame | None:
    path = base / rel
    if not path.exists():
        return None
    return pd.read_parquet(path)


def _gap_payload_from_row(row) -> dict:
    brain_cells = json.loads(row["brain_cells_json"])
    return {
        "brain_cells": [
            {
                "cell_id": str(b["cell_id"]),
                "consensus": float(b["consensus"]),
                "below_theta": bool(b["below_theta"]),
            }
            for b in brain_cells
        ],
        "cancer_lines_only": bool(row["cancer_lines_only"]),
        "doses_um": [float(v) for v in list(row["doses_um"])],
        "times_h": [float(v) for v in list(row["times_h"])],
        "exposure": {
            "level": str(row["exposure_level"]),
            "label": str(row["exposure_label"]),
            "measured_available": bool(row["measured_available"]),
        },
        "has_targets": bool(row["has_targets"]),
    }


def gap_payload_for(base: Path, pert_id: str) -> dict:
    """EvidenceGaps payload for one drug, ranking contexts only."""
    from app.services.repository import NotFoundError

    gaps_df = _maybe_frame(base, "evidence/gaps.parquet")
    if gaps_df is not None and pert_id in set(gaps_df["pert_id"].astype(str)):
        return _gap_payload_from_row(gaps_df[gaps_df["pert_id"].astype(str) == pert_id].iloc[0])
    # Fallback: derive live from the processed tables (same function as gaps.py).
    from pipelines.evidence import gaps as gaps_mod

    ranking = _need_frame(base, f"scores/{_RANKING_NAME}__compound_ranking.parquet")
    context = _need_frame(base, f"scores/{_RANKING_NAME}__context_scores.parquet")
    exposure = _maybe_frame(base, "evidence/exposure.parquet")
    targets = _maybe_frame(base, "evidence/targets.parquet")
    derived = gaps_mod.derive_gaps(
        ranking[ranking["pert_id"].astype(str) == pert_id],
        context,
        exposure if exposure is not None else pd.DataFrame(columns=["pert_id", "level", "value"]),
        targets if targets is not None else pd.DataFrame(columns=["pert_id"]),
        gaps_mod.load_theta(),
    )
    if derived.empty:
        raise NotFoundError(pert_id)
    return _gap_payload_from_row(derived.iloc[0])


def molecule_for(base: Path, drug_id: str) -> dict | None:
    """Molecule3D payload when evidence/molecules/{drug_id}.json exists, else None."""
    path = base / "evidence" / "molecules" / f"{drug_id}.json"
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        atoms = payload["atoms"]
        bonds = payload["bonds"]
        return {
            "formula": str(payload["formula"]),
            "atoms": [
                {"el": str(a["el"]), "x": float(a["x"]), "y": float(a["y"]), "z": float(a["z"])}
                for a in atoms
            ],
            "bonds": [[int(v) for v in b] for b in bonds],
            **({"smiles": str(payload["smiles"])} if payload.get("smiles") else {}),
            **({"method": str(payload["method"])} if payload.get("method") else {}),
        }
    except (KeyError, TypeError, ValueError):
        return None


def build_drug_detail(base: Path, drug_id: str, evidence: dict, provenance: dict) -> dict:
    """Assemble a DrugDetail payload. `evidence` is the repository evidence card."""
    from app.services.repository import NotFoundError

    ranking = _need_frame(base, f"scores/{_RANKING_NAME}__compound_ranking.parquet")
    hit = ranking[ranking["pert_id"].astype(str) == drug_id]
    if hit.empty:
        raise NotFoundError(drug_id)
    rrow = hit.iloc[0]
    pool = _maybe_frame(base, f"scores/{_RANKING_NAME}__candidate_pool.parquet")
    prow = None
    rank_total = None
    if pool is not None and drug_id in set(pool["pert_id"].astype(str)):
        prow = pool[pool["pert_id"].astype(str) == drug_id].iloc[0]
        rank_total = int(len(pool))
    context = _need_frame(base, f"scores/{_RANKING_NAME}__context_scores.parquet")
    ctx = context[(context["pert_id"].astype(str) == drug_id) & (context["split"] == "ranking")].copy()
    ctx = ctx.sort_values(["cell_id", "pert_idose", "pert_itime"])
    contexts = [
        {
            "cell_id": str(r.cell_id),
            "dose": str(r.pert_idose),
            "time": str(r.pert_itime),
            "consensus": float(r.consensus),
            "neural": bool(str(r.cell_id) in _NEURAL_CELLS),
        }
        for r in ctx.itertuples()
    ]
    truth = _maybe_frame(base, "tauchstone/truth_table.parquet")
    n_hidden = int((truth["candidate_id"].astype(str) == drug_id).sum()) if truth is not None else 0
    attack_ready = bool(n_hidden > 0) if truth is not None else False
    name = (
        display_name(prow["drug_name"])
        if prow is not None and pd.notna(prow["drug_name"])
        else display_name(rrow["pert_iname"])
    )
    return {
        "drug_id": drug_id,
        "name": name,
        "pool_rank": int(prow["pool_rank"]) if prow is not None else None,
        "rank_total": rank_total,
        "consensus": float(rrow["consensus_median"]),
        "n_contexts": int(rrow["n_ranking_contexts"]),
        "scores": {
            "wtcs": float(rrow["z_wtcs_median"]),
            "ks": float(rrow["z_ks_median"]),
            "cosine": float(rrow["z_cosine_median"]),
        },
        "approval_status": evidence.get("approval_status"),
        "mechanism": evidence.get("mechanism"),
        "targets": evidence.get("targets"),
        "structure": evidence.get("structure"),
        "gaps": gap_payload_for(base, drug_id),
        "contexts": contexts,
        "molecule": molecule_for(base, drug_id),
        "n_hidden_tests": n_hidden if truth is not None else None,
        "attack_ready": attack_ready,
        "preregistered": attack_ready,
        "provenance": provenance,
    }


def lookup_compounds(base: Path, names: list[str]) -> list[dict]:
    """LookupResult rows in input order over this checkout's processed tables."""
    from pipelines.evidence import lookup as lookup_mod

    ranking = _need_frame(base, f"scores/{_RANKING_NAME}__compound_ranking.parquet")
    pool = _need_frame(base, f"scores/{_RANKING_NAME}__candidate_pool.parquet")
    compounds = _need_frame(base, "lincs/compounds.parquet")
    drug_map = _need_frame(base, "evidence/drug_map.parquet")
    truth = _maybe_frame(base, "tauchstone/truth_table.parquet")
    if truth is None:
        truth = pd.DataFrame(columns=["candidate_id"])
    return lookup_mod.lookup(
        names,
        ranking=ranking,
        pool=pool,
        compounds=compounds,
        drug_map=drug_map,
        truth=truth,
    )


def get_drug_detail(drug_id: str, project_id: str | None = None) -> dict:
    """DrugDetail payload exactly as GET /drugs/{drug_id} serves it (used by the report renderer)."""
    from app.deps import get_repository
    from app.present import public

    return public(get_repository().get_drug_detail(drug_id))
