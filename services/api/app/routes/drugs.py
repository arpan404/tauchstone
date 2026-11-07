"""GET /drugs/{drug_id}: evidence, gaps, ranking contexts and 3D molecule."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_repository
from app.present import public
from app.schemas.models import DrugDetail
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/drugs/{drug_id}", response_model=DrugDetail, response_model_exclude_unset=True)
def get_drug(
    drug_id: str, repo: Annotated[Repository, Depends(get_repository)]
) -> dict:
    try:
        return public(repo.get_drug_detail(drug_id))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
