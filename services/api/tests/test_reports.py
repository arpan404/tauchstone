"""Report contract, leakage boundary, and offline rendering checks."""
import io
import sys
from dataclasses import replace
from hashlib import sha256
from types import SimpleNamespace

import pytest
from app.main import app
from app.services import report_render as render
from app.services.report_render import get_drug_detail_provider
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(render, 'settings', replace(render.settings, mock=True))
    app.dependency_overrides[get_drug_detail_provider] = render.DefaultDrugDetail
    yield TestClient(app)
    app.dependency_overrides.pop(get_drug_detail_provider, None)


def test_html_contract_and_hash(client):
    response = client.get('/reports/brinzolamide')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/html')
    html = response.text
    for value in ['Brinzolamide', 'Clinical-stage rank 12', '-1.67', 'HA1E, MCF7, PHH', '6 h, 24 h',
                  'predicted low', 'CA2 P00918', '0.037', '3 hidden tests', 'not preregistered',
                  'Synthetic data', 'GSE132903', 'LINCS GSE92742/GSE70138', 'commit mock', render.BOUNDARY]:
        assert value in html
    assert sha256((render.ROOT / 'data/manifests/preregistration.yaml').read_bytes()).hexdigest()[:8] in html
    for heading in ['LINCS data', 'Evidence gaps', 'Targets', 'Attack', 'Suggested next experiment', 'Data source']:
        assert f'<h2>{heading}</h2>' in html


def test_hidden_fields_never_render_and_html_is_escaped():
    detail = render.DefaultDrugDetail().get_drug_detail('piperacillin', None)
    detail.update(name='<script>alert(1)</script>', hidden=[{'value': 'SECRET_OUTCOME'}],
                  truth_table='SECRET_TABLE', revealed='SECRET_REVEAL')
    detail['targets'] = [{'symbol': 'CA2', 'hidden': 'SECRET_TARGET'}]
    html = render.render_html(detail)
    assert '<script>' not in html
    assert '&lt;script&gt;' in html
    assert 'SECRET_' not in html


def test_unknown_and_project_scope(client):
    assert client.get('/reports/unknown').status_code == 404
    assert client.get('/reports/piperacillin?project_id=uploaded').status_code == 404
    assert client.get('/reports/unknown.pdf').status_code == 404


def test_real_mode_never_uses_fixture(monkeypatch):
    monkeypatch.setattr(render, 'settings', replace(render.settings, mock=False))
    monkeypatch.setitem(sys.modules, 'app.services.drug_detail',
                        SimpleNamespace(get_drug_detail=lambda d, p: (_ for _ in ()).throw(render.NotFoundError(d))))
    with pytest.raises(render.NotFoundError):  # real mode asks the real service, never the fixture
        render.DefaultDrugDetail().get_drug_detail('piperacillin', None)


def test_future_detail_provider_receives_project(monkeypatch):
    seen = []
    def get_detail(drug_id, project_id):
        seen.append((drug_id, project_id))
        return {'name': 'real'}
    monkeypatch.setattr(render, 'settings', replace(render.settings, mock=False))
    monkeypatch.setitem(sys.modules, 'app.services.drug_detail', SimpleNamespace(get_drug_detail=get_detail))
    assert render.DefaultDrugDetail().get_drug_detail('BRD-real', 'project-2') == {'name': 'real'}
    assert seen == [('BRD-real', 'project-2')]


def test_print_fallback_is_html_not_fake_pdf(client, monkeypatch):
    def unavailable(html):
        raise OSError('native renderer missing')
    monkeypatch.setattr(render, 'render_pdf', unavailable)
    response = client.get('/reports/brinzolamide.pdf')
    assert response.headers['content-type'].startswith('text/html')
    assert response.headers['x-report-fallback'] == 'print-html'
    assert 'window.print()' in response.text
    assert '@media print' in response.text
    assert 'content-disposition' not in response.headers


def test_pdf_contract_offline(client, monkeypatch):
    import socket

    try:
        from weasyprint import HTML  # noqa: F401
    except (ImportError, OSError):
        pytest.skip('Native WeasyPrint libraries unavailable; fallback and PDF route tested separately')
    def blocked(*args, **kwargs):
        raise AssertionError('network access')
    monkeypatch.setattr(socket, 'create_connection', blocked)
    response = client.get('/reports/brinzolamide.pdf')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/pdf'
    assert response.content.startswith(b'%PDF-')
    assert len(response.content) > 1000
    from pypdf import PdfReader
    document = PdfReader(io.BytesIO(response.content))
    assert len(document.pages) == 1
    text = document.pages[0].extract_text()
    # Section headings are set in capitals by CSS, so compare case-insensitively.
    for value in ['Brinzolamide', 'CA2', 'P00918', 'Data source', '3 hidden tests', 'not preregistered']:
        assert value.lower() in text.lower(), value
    assert 'attachment' in response.headers['content-disposition']


def test_next_experiment_order():
    gaps = dict(brain_cells=[], exposure={'measured_available': False}, has_targets=False, times_h=[6])
    assert 'neural' in render.next_experiment(gaps)
    gaps['brain_cells'] = [{'cell_id': 'NEU'}]
    assert render.next_experiment(gaps) == 'Measure brain exposure'
    gaps['exposure']['measured_available'] = True
    assert render.next_experiment(gaps) == 'Measure target engagement'
    gaps['has_targets'] = True
    assert 'time point' in render.next_experiment(gaps)


def test_csv_allowlist_and_formula_escaping(client, monkeypatch):
    from app.routes import projects
    rows = [{'id': 'BRD-1', 'name': '=FORMULA()', 'rank': 1, 'consensus': -1.7, 'hidden': 'SECRET_OUTCOME'}]
    monkeypatch.setattr(projects.store, 'seed', lambda: None)
    monkeypatch.setattr(projects.store, 'candidates', lambda *a, **k: {'candidates': rows})
    response = client.get('/projects/GSE132903/candidates.csv')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert "'=FORMULA()" in response.text
    assert '-1.7' in response.text
    assert 'SECRET_OUTCOME' not in response.text


def test_pdf_suffix_is_not_html_drug_id(client, monkeypatch):
    monkeypatch.setattr(render, 'render_pdf', lambda html: b'%PDF-contract-stub')
    response = client.get('/reports/piperacillin.pdf')
    assert response.headers['content-type'] == 'application/pdf'
    assert response.content == b'%PDF-contract-stub'


def test_approval_status_dict_renders_as_label():
    from app.services import report_render
    html = report_render.render_html({
        'name': 'X', 'approval_status': {'status': 'approved', 'max_phase': 4.0,
                                         'source': {'label': 'ChEMBL', 'url': 'https://example'}},
        'gaps': {}, 'provenance': {}}, 'GSE132903')
    assert 'approved · phase 4' in html
    assert "{'status'" not in html and '{&#39;status' not in html
    assert 'Signature GSE132903' in html


def _session_store_with_one_reveal(candidate_id='brinzolamide'):
    from app.services.engine_adapter import Context, EngineConfig, HiddenRow, MockAttackSession
    from app.services.sessions import SessionStore

    def row(i, outcome, value):
        ctx = Context(context_id=f'ctx-{i}', type='lincs_context', label=f'LABEL_{i} 10 uM',
                      cell_id=f'CELL{i}', cohort=f'GSE_SECRET_{i}')
        return HiddenRow(context=ctx, outcome=outcome, value=value, threshold=-0.5,
                         rule='rule', detail=f'DETAIL_SECRET_{i}')
    hidden = [row(0, 'fail', 0.4321), row(1, 'survive', -0.9876), row(2, 'survive', -0.8765)]
    engine = MockAttackSession(candidate_id, hidden, [], EngineConfig(q=0.7, theta=-0.5, claim_text='claim'),
                               budget=2)
    engine.run('ctx-0')
    store = SessionStore()
    rec = store.create(engine, candidate_id, preregistered=False)
    return store, rec.session_id


def test_session_snapshot_shows_revealed_and_never_hidden(client):
    from app.deps import get_session_store
    store, sid = _session_store_with_one_reveal()
    app.dependency_overrides[get_session_store] = lambda: store
    try:
        html = client.get(f'/reports/brinzolamide?session_id={sid}').text
    finally:
        app.dependency_overrides.pop(get_session_store, None)
    assert '<h2>Attack session</h2>' in html and '<h2>Attack</h2>' not in html
    for value in ['LABEL_0 10 µM', 'Held-back LINCS condition', 'Failed', '0.43', '-0.50', 'Tests run',
                  '1 of 2', '2 hidden tests not run', 'not preregistered', 'Chance claim holds, start']:
        assert value in html, value
    assert any(v in html for v in ('INSUFFICIENT EVIDENCE', 'FRAGILE / CONTEXT-DEPENDENT', 'SUPPORTED SO FAR'))
    # Unrevealed tests: no label, value, outcome, detail or cohort; revealed detail/cohort stay out too.
    for secret in ['LABEL_1', 'LABEL_2', '-0.99', '-0.88', 'Survived', 'DETAIL_SECRET', 'GSE_SECRET', 'ctx-1', 'ctx-2']:
        assert secret not in html, secret


def test_session_for_another_drug_is_ignored(client):
    from app.deps import get_session_store
    store, sid = _session_store_with_one_reveal('BRD-other')
    app.dependency_overrides[get_session_store] = lambda: store
    try:
        html = client.get(f'/reports/brinzolamide?session_id={sid}').text
        unknown = client.get('/reports/brinzolamide?session_id=nope').text
    finally:
        app.dependency_overrides.pop(get_session_store, None)
    for page in (html, unknown):
        assert 'No tests run yet' in page and 'LABEL_0' not in page and 'Attack session' not in page


def test_pdf_filename_and_print_title(client, monkeypatch):
    from datetime import date
    monkeypatch.setattr(render, 'render_pdf', lambda html: b'%PDF-1.7 fake')
    response = client.get('/reports/brinzolamide.pdf')
    stem = f'tauchstone-brinzolamide-{date.today().isoformat()}'
    assert response.headers['content-type'] == 'application/pdf'
    assert response.headers['content-disposition'] == f'attachment; filename="{stem}.pdf"'
    assert f'<title>{stem}</title>' in client.get('/reports/brinzolamide').text
    assert render.slug('Ácido 5-ASA (HCl)') == 'acido-5-asa-hcl'


def test_withdrawn_drug_is_flagged_in_report():
    from app.services import report_render
    html = report_render.render_html({
        'name': 'Ticrynafen', 'approval_status': {'status': 'approved', 'max_phase': 4.0, 'withdrawn': True,
                                                  'withdrawn_year': 1980, 'withdrawn_country': 'France; United States'},
        'gaps': {}, 'provenance': {}}, 'GSE132903')
    assert 'approved · phase 4 · withdrawn 1980' in html
    single = report_render.withdrawn_label({'withdrawn': True, 'withdrawn_year': 2000, 'withdrawn_country': 'Vietnam'})
    assert single == 'withdrawn in Vietnam 2000'
    assert report_render.withdrawn_label({'withdrawn': False}) is None


def test_report_embeds_its_fonts_offline():
    from app.services import report_render
    css = report_render.font_faces_css()
    assert "font-family:'Instrument Sans'" in css and "font-family:'Geist Mono'" in css
    assert 'url(data:font/woff2;base64,' in css and 'http' not in css
    html = report_render.render_html({'name': 'X', 'gaps': {}, 'provenance': {}}, 'GSE132903')
    assert "'Instrument Sans'" in html


def test_pdf_fetcher_allows_only_embedded_data():
    import pytest
    weasy = pytest.importorskip('weasyprint.urls')
    fetcher = weasy.URLFetcher(allowed_protocols={'data'})
    with pytest.raises(ValueError):
        fetcher.fetch('https://example.org/font.woff2')
    with pytest.raises(ValueError):
        fetcher.fetch('file:///etc/hosts')
