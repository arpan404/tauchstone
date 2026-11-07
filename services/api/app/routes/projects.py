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
    # Built-in projects first (preregistered primary on top), then uploads newest first.
    records = store.all_records('project')
    return sorted(records, key=lambda p: (p.get('kind') != 'builtin', not p.get('preregistered'),
                                          '' if p.get('kind') == 'builtin' else _neg(p.get('created_at', ''))))


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
    for row in rows:
        # Spreadsheet formula injection is possible even in a quoted CSV cell.
        writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v
                         for k, v in row.items()})
    return Response(stream.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': 'attachment; filename="candidates.csv"'})


def _neg(stamp: str) -> str:
    """Sort key that orders ISO timestamps newest first."""
    return ''.join(chr(0x10FFFF - ord(c)) for c in stamp)
