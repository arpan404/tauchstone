"""Projects and per-project candidate exports."""
import csv
import io

from fastapi import APIRouter, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.services import projects as store

router = APIRouter()


class CreateProject(BaseModel):
    name: str
    signature_id: str | None = None


@router.get('/projects')
def projects():
    store.seed()
    return store.all_records('project')


@router.post('/projects')
def create(body: CreateProject):
    store.seed()
    return store.create(body.name, body.signature_id)


@router.get('/projects/{project_id}/candidates')
def candidates(project_id: str, approved: bool | None = None, brain_cells: bool | None = None,
               penetrant: bool | None = None, min_contexts: int | None = None,
               limit: int = Query(100, ge=1, le=500)):
    store.seed()
    return store.candidates(project_id, approved, brain_cells, penetrant, min_contexts, limit)


@router.get('/projects/{project_id}/candidates.csv')
def export(project_id: str, approved: bool | None = None, brain_cells: bool | None = None,
           penetrant: bool | None = None, min_contexts: int | None = None):
    store.seed()
    rows = store.candidates(project_id, approved, brain_cells, penetrant, min_contexts, 10**9)['candidates']
    stream = io.StringIO()
    fields = ['id', 'rank', 'name', 'consensus', 'n_ranking_contexts', 'brain_cells', 'penetrant',
              'exposure_label', 'cancer_lines_only', 'attack_ready', 'preregistered']
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    return Response(stream.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': 'attachment; filename="candidates.csv"'})
