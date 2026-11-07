"""Offline cross-resource agreement; reads only the report-only cache."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.settings import settings

router = APIRouter()
RESOURCES = ("tauchstone_lincs_gold", "perturb_seqr", "clue")
FIXTURE = Path(__file__).resolve().parents[4] / "contracts/fixtures/getDrugResources.json"


class ResourceAgreement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resource: Literal["tauchstone_lincs_gold", "clue", "perturb_seqr"]
    status: Literal["available", "not_fetched", "needs_key", "not_available", "not_found"]
    rank: int | None = None
    n_ranked: int | None = None
    score: float | None = None
    fetched_at: str | None = None
    source_url: str | None = None
    note: str | None = None


def missing(resource: str) -> dict:
    return {
        "resource": resource,
        "status": "not_fetched",
        "note": "not preregistered; report-only. No cached result for this compound.",
    }


@router.get("/drugs/{drug_id}/resources", response_model=list[ResourceAgreement], response_model_exclude_unset=True)
def get_drug_resources(drug_id: str) -> list[dict]:
    if settings.mock:
        # A fixture is tied to its mock compound; never attach its ranks to arbitrary IDs.
        fixture_id = json.loads((FIXTURE.parent / "listCandidates.json").read_text())["candidates"][0]["id"]
        return json.loads(FIXTURE.read_text()) if drug_id == fixture_id else [missing(r) for r in RESOURCES]
    path = settings.data_dir / "processed/resources/agreement.parquet"
    if not path.exists():
        return [missing(r) for r in RESOURCES]
    frame = pd.read_parquet(path, filters=[("pert_id", "==", drug_id)])
    rows = {}
    columns = list(ResourceAgreement.model_fields)
    for record in frame.to_dict("records"):
        rows[record["resource"]] = {
            key: None if pd.isna(record[key]) else record[key] for key in columns if key in record
        }
    return [rows.get(resource, missing(resource)) for resource in RESOURCES]
