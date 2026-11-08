"""HTML and offline PDF drug reports. No truth-table access.

With ``session_id`` the report adds a snapshot of that attack session, built only from the
engine's public state (revealed tests; hidden tests as a count).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response

from app.deps import get_session_store
from app.services import report_render
from app.services.report_render import DrugDetail, get_drug_detail_provider
from app.services.repository import NotFoundError
from app.services.sessions import SessionStore

router = APIRouter()


def _detail(provider: DrugDetail, drug_id: str, project_id: str | None) -> dict:
    try:
        return provider.get_drug_detail(drug_id, project_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except report_render.DetailUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc


def _session(store: SessionStore, session_id: str | None, drug_id: str) -> dict | None:
    """Snapshot only for a live session on this drug; otherwise the report shows 'Not attacked yet'."""
    if not session_id:
        return None
    rec = store.get(session_id)
    if rec is None or str(rec.candidate_id) != drug_id:
        return None
    return report_render.session_snapshot(rec.engine.state(), rec.preregistered)


def _render(detail: dict, drug_id: str, project_id: str | None, session: dict | None,
            fallback: bool = False) -> str:
    return report_render.render_html(detail, project_id, fallback=fallback, session=session,
                                     title=report_render.report_filename(detail, drug_id))


# Register suffix route first; otherwise the HTML path consumes '.pdf'.
@router.get('/reports/{drug_id}.pdf')
def report_pdf(drug_id: str, provider: Annotated[DrugDetail, Depends(get_drug_detail_provider)],
               store: Annotated[SessionStore, Depends(get_session_store)],
               project_id: str | None = None, session_id: str | None = None) -> Response:
    detail = _detail(provider, drug_id, project_id)
    session = _session(store, session_id, drug_id)
    html = _render(detail, drug_id, project_id, session)
    try:
        pdf = report_render.render_pdf(html)
    except (ImportError, OSError, RuntimeError):
        return HTMLResponse(_render(detail, drug_id, project_id, session, fallback=True),
                            headers={'X-Report-Fallback': 'print-html'})
    filename = report_render.report_filename(detail, drug_id)
    return Response(pdf, media_type='application/pdf', headers={
        'Content-Disposition': f'attachment; filename="{filename}.pdf"'})


@router.get('/reports/{drug_id}', response_class=HTMLResponse)
def report_html(drug_id: str, provider: Annotated[DrugDetail, Depends(get_drug_detail_provider)],
                store: Annotated[SessionStore, Depends(get_session_store)],
                project_id: str | None = None, session_id: str | None = None) -> str:
    detail = _detail(provider, drug_id, project_id)
    return _render(detail, drug_id, project_id, _session(store, session_id, drug_id))
