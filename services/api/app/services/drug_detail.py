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
from functools import lru_cache
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


SOURCING_SOURCE = "Broad Drug Repurposing Hub sample QC (2020)"
SOURCING_NOTE = ("Purities measured by the Broad on vendor samples bought around 2020. "
                 "Any lab must re-check the purity of its own sample.")


@lru_cache(maxsize=4)
def _sourcing_cached(path: str, mtime: float) -> dict[str, dict]:
    frame = pd.read_parquet(path)
    return {str(r["pert_id"]): r for r in frame.to_dict("records")}


def sourcing_for(base: Path, drug_id: str) -> dict | None:
    """Purity and sourcing check from evidence/sourcing.parquet; None when the table is absent.
    Display only: never feeds ranking, threshold, pool, truth table or any verdict."""
    path = base / "evidence" / "sourcing.parquet"
    if not path.is_file():
        return None
    row = _sourcing_cached(str(path), path.stat().st_mtime).get(str(drug_id))
    if row is None:
        return {"status": "no_record", "threshold_pct": 95.0, "n_samples": 0,
                "n_samples_at_or_above_95": 0, "n_vendors": 0, "vendors": [],
                "qc_incompatible": False, "n_qc_incompatible": 0, "match": "none",
                "source": SOURCING_SOURCE, "note": SOURCING_NOTE}

    def text(key: str) -> str | None:
        v = row.get(key)
        return v if isinstance(v, str) and v else None

    best = row.get("best_purity_pct")
    return {
        "status": str(row["status"]),
        "threshold_pct": 95.0,
        "best_purity_pct": float(best) if best is not None and pd.notna(best) else None,
        "n_samples": int(row.get("n_samples") or 0),
        "n_samples_at_or_above_95": int(row.get("n_samples_at_or_above_95") or 0),
        "n_vendors": int(row.get("n_vendors") or 0),
        "vendors": [v.strip() for v in (text("vendors") or "").split(";") if v.strip()],
        "best_vendor": text("best_vendor"),
        "best_catalog_no": text("best_catalog_no"),
        "qc_incompatible": bool(row.get("qc_incompatible")),
        "n_qc_incompatible": int(row.get("n_qc_incompatible") or 0),
        "match": str(row.get("match") or "none"),
        "source": SOURCING_SOURCE,
        "note": SOURCING_NOTE,
    }


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
        "sourcing": sourcing_for(base, drug_id),
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

    return public(project_overlay(adhoc_overlay(get_repository().get_drug_detail(drug_id)), project_id))


def project_overlay(detail: dict, project_id: str | None) -> dict:
    """Rank, total, consensus and method scores from a non-preregistered project's own screen.

    Evidence, gaps and contexts stay from the frozen tables. A drug outside that project's
    ranking (or a project not screened yet) gets pool_rank null.
    """
    from fastapi import HTTPException

    from app.services import projects as store
    from app.services.repository import NotFoundError

    if not project_id:
        return detail
    store.seed()
    try:
        project = store.get("project", project_id)
    except HTTPException as e:
        raise NotFoundError(f"project not found: {project_id}") from e
    if project.get("preregistered"):
        return detail
    out = dict(detail, preregistered=False, pool_rank=None, rank_total=None)
    sid = project.get("last_screen_id")
    if not sid:
        return out
    if store.settings.mock:
        rows = [
            dict(pert_id=c["id"], pool_rank=c["rank"], consensus_median=c["consensus"],
                 n_ranking_contexts=c["n_ranking_contexts"],
                 **{f"z_{k}_median": v for k, v in (c.get("scores") or {}).items()})
            for c in store.mock_candidates()
        ]
        pool = pd.DataFrame(rows)
    else:
        path = store.root() / f"{sid}.parquet"
        if not path.exists():
            return out
        pool = pd.read_parquet(path)
    out["rank_total"] = int(len(pool))
    hit = pool[pool["pert_id"].astype(str) == str(detail["drug_id"])]
    if hit.empty:
        return out
    row = hit.iloc[0]
    out.update(pool_rank=int(row["pool_rank"]), consensus=float(row["consensus_median"]))
    if "n_ranking_contexts" in row:
        out["n_contexts"] = int(row["n_ranking_contexts"])
    keys = ("wtcs", "ks", "cosine")
    if all(f"z_{k}_median" in row and pd.notna(row[f"z_{k}_median"]) for k in keys):
        out["scores"] = {k: float(row[f"z_{k}_median"]) for k in keys}
    return out


def adhoc_overlay(detail: dict) -> dict:
    """Count hidden tests built on the fly for this drug in a live attack session.

    Reads only the size of the server-side session (never outcomes); the sealed truth-table
    count wins when the drug has one. Stays not preregistered.
    """
    if detail.get("n_hidden_tests"):
        return detail
    from app.deps import get_session_store

    sessions = getattr(get_session_store(), "_sessions", {})
    for rec in list(sessions.values()):
        if rec.candidate_id == detail.get("drug_id") and not rec.preregistered:
            try:
                n = len(rec.engine.state()["contexts"])
            except Exception:
                continue
            return dict(detail, n_hidden_tests=n, attack_ready=n > 0)
    return detail
