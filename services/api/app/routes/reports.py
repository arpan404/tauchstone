"""HTML and offline PDF drug reports. No truth-table access."""
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from app.services import report_render
from app.services.report_render import DrugDetail, get_drug_detail_provider
from app.services.repository import NotFoundError

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
        'Content-Disposition': f"attachment; filename*=UTF-8''{quote(drug_id, safe='')}-report.pdf"})


@router.get('/reports/{drug_id}', response_class=HTMLResponse)
def report_html(drug_id: str, provider: Annotated[DrugDetail, Depends(get_drug_detail_provider)],
                project_id: str | None = None) -> str:
    return report_render.render_html(_detail(provider, drug_id, project_id), project_id)
