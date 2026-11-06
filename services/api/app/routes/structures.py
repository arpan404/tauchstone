"""GET /structures/{pdb_id}.cif — offline structure files for evidence cards."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.deps import get_repository
from app.services.repository import NotFoundError, Repository

router = APIRouter()


@router.get("/structures/{pdb_id}.cif")
def get_structure(
    pdb_id: str, repo: Annotated[Repository, Depends(get_repository)]
):
    try:
        path = repo.get_structure_path(pdb_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return FileResponse(path, media_type="chemical/x-cif", filename=f"{pdb_id}.cif")
