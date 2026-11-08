"""GET /drugs/{drug_id}: evidence, gaps, ranking contexts and 3D molecule."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_repository
from app.present import public
from app.schemas.models import DrugDetail
from app.services.drug_detail import adhoc_overlay, project_overlay
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/drugs/{drug_id}", response_model=DrugDetail, response_model_exclude_unset=True)
def get_drug(
    drug_id: str, repo: Annotated[Repository, Depends(get_repository)],
    project_id: str | None = None,
) -> dict:
    try:
        return public(project_overlay(adhoc_overlay(repo.get_drug_detail(drug_id)), project_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
