"""GET /signatures/{cohort}."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_repository, get_session_store
from app.present import public
from app.schemas.models import Signature
from app.services.repository import NotFoundError, Repository
from app.services.sessions import SessionStore

router = APIRouter()

COHORTS = ("GSE132903", "GSE173955", "GSE53697")
HELD_OUT = ("GSE173955", "GSE53697")
VARIANTS = ("main", "composition_adjusted")


@router.get("/signatures/{cohort}", response_model=Signature, response_model_exclude_unset=True)
def get_signature(
    cohort: str,
    repo: Annotated[Repository, Depends(get_repository)],
    store: Annotated[SessionStore, Depends(get_session_store)],
    variant: str = "main",
    session_id: str | None = None,
) -> dict:
    if cohort not in COHORTS or variant not in VARIANTS:
        raise HTTPException(status_code=404, detail=f"unknown signature: {cohort}__{variant}")
    if cohort in HELD_OUT:
        rec = store.get(session_id) if session_id else None
        if rec is None or cohort not in rec.revealed_cohorts:
            raise HTTPException(
                status_code=403,
                detail=f"{cohort} is held-out validation data and has not been revealed "
                "by this session yet",
            )
    try:
        return public(repo.get_signature(cohort, variant))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
