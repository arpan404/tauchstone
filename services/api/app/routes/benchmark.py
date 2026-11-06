"""GET /benchmark."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_repository
from app.present import public
from app.schemas.models import Benchmark
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/benchmark", response_model=Benchmark, response_model_exclude_unset=True)
def get_benchmark(repo: Annotated[Repository, Depends(get_repository)]) -> dict:
    try:
        return public(repo.get_benchmark())
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
