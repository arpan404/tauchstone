"""GET /candidates and GET /candidates/{id}/evidence."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import get_repository
from app.present import public
from app.schemas.models import CandidateList, EvidenceCard
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/candidates", response_model=CandidateList, response_model_exclude_unset=True)
def list_candidates(
    repo: Annotated[Repository, Depends(get_repository)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    return public(repo.list_candidates(limit))


@router.get("/candidates/{candidate_id}/evidence", response_model=EvidenceCard, response_model_exclude_unset=True)
def get_evidence(
    candidate_id: str, repo: Annotated[Repository, Depends(get_repository)]
) -> dict:
    try:
        return public(repo.get_evidence(candidate_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
