"""GET /compounds/search: typeahead for the My compounds picker.

Searches every name POST /lookup understands (LINCS compounds, clinical names,
brand names and synonyms). Rank and reversal score come from the preregistered
GSE132903 ranking only.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import get_repository
from app.present import public
from app.schemas.models import CompoundMatch
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/compounds/search", response_model=list[CompoundMatch], response_model_exclude_unset=True)
def search_compounds(
    repo: Annotated[Repository, Depends(get_repository)],
    q: Annotated[str, Query(max_length=200)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list:
    try:
        return public(repo.search_compounds(q, limit))
    except NotFoundError as e:
        raise HTTPException(status_code=503, detail=f"compound tables missing: {e}") from e
