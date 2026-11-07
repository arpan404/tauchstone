"""HTML and offline PDF drug reports. No truth-table access."""
import csv
import importlib
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from app.deps import get_repository
from app.services import report_render
from app.services.report_render import DrugDetail, get_drug_detail_provider
from app.services.repository import NotFoundError
from app.settings import settings

router = APIRouter()


def _detail(provider: DrugDetail, drug_id: str, project_id: str | None) -> dict:
    try:
        return provider.get_drug_detail(drug_id, project_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except report_render.DetailUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc


# Register suffix route first; otherwise the HTML path consumes '.pdf'.
@router.get('/reports/{drug_id}.pdf')
def report_pdf(drug_id: str, provider: Annotated[DrugDetail, Depends(get_drug_detail_provider)],
               project_id: str | None = None) -> Response:
    detail = _detail(provider, drug_id, project_id)
    html = report_render.render_html(detail, project_id)
    try:
        pdf = report_render.render_pdf(html)
    except (ImportError, OSError, RuntimeError):
        return HTMLResponse(report_render.render_html(detail, project_id, fallback=True),
                            headers={'X-Report-Fallback': 'print-html'})
    return Response(pdf, media_type='application/pdf', headers={
        'Content-Disposition': 'attachment; filename="drug-report.pdf"'})


@router.get('/reports/{drug_id}', response_class=HTMLResponse)
def report_html(drug_id: str, provider: Annotated[DrugDetail, Depends(get_drug_detail_provider)],
                project_id: str | None = None) -> str:
    return report_render.render_html(_detail(provider, drug_id, project_id), project_id)


@router.get('/projects/{project_id}/candidates.csv')
def candidates_csv(project_id: str) -> Response:
    """Export public ranking fields only. No hidden context or exposure values."""
    try:
        module = importlib.import_module('app.services.projects')
    except ModuleNotFoundError as exc:
        if exc.name != 'app.services.projects':
            raise
        if not settings.mock:
            raise HTTPException(503, 'Project candidates service unavailable') from exc
        if project_id != 'builtin-gse132903':
            raise HTTPException(404, 'Mock project not found') from exc
        payload = get_repository().list_candidates(200)
    else:
        try:
            payload = module.get_project_candidates(project_id)
        except NotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
    output = io.StringIO(newline='')
    columns = ['candidate_id', 'name', 'rank', 'consensus', 'n_contexts', 'approval_status', 'preregistered']
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()
    for row in payload.get('candidates', []):
        values = {key: row.get(key, 'unspecified') for key in columns}
        values['candidate_id'] = row.get('candidate_id', row.get('drug_id', 'unspecified'))
        values['rank'] = row.get('rank', row.get('pool_rank', 'unspecified'))
        values['preregistered'] = row.get('preregistered', payload.get('preregistered', False))
        # Spreadsheet formula injection is possible even in a quoted CSV cell.
        writer.writerow({key: "'" + value if isinstance(value, str) and value.startswith(('=', '+', '-', '@'))
                         else value for key, value in values.items()})
    return Response(output.getvalue(), media_type='text/csv', headers={
        'Content-Disposition': 'attachment; filename="candidates.csv"'})
