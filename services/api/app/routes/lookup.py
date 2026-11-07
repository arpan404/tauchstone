"""POST /lookup: resolve a lab's compound list against the LINCS pool."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import get_repository
from app.present import public
from app.schemas.models import LookupRequest, LookupResult
from app.services.repository import Repository

router = APIRouter()


@router.post("/lookup", response_model=list[LookupResult], response_model_exclude_unset=True)
def lookup_compounds(
    body: LookupRequest, repo: Annotated[Repository, Depends(get_repository)]
) -> list:
    return public(repo.lookup_compounds(body.names))
