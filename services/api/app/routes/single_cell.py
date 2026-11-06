"""Independent exploratory single-cell panel; never loads attack outcomes."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_repository
from app.schemas.models import Error, SingleCellExploratory
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get('/exploratory/single-cell', response_model=SingleCellExploratory,
            response_model_exclude_unset=True, responses={404: {'model': Error}})
def get_single_cell(repo: Annotated[Repository, Depends(get_repository)]) -> dict:
    try:
        return repo.get_single_cell()
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
