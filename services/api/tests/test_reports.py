"""Report contract, leakage boundary, and offline rendering checks."""
import io
import sys
from dataclasses import replace
from hashlib import sha256
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import report_render as render
from app.services.report_render import get_drug_detail_provider


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
    for value in ['Brinzolamide', 'Pool rank 12', '-1.67', 'HA1E, MCF7, PHH', '6 h, 24 h',
                  'predicted low', 'CA2 P00918', '0.037', '3 hidden tests', 'not preregistered',
                  'Mock fixture', 'GSE132903', 'LINCS GSE92742/GSE70138', 'commit mock', render.BOUNDARY]:
        assert value in html
    assert sha256((render.ROOT / 'data/manifests/preregistration.yaml').read_bytes()).hexdigest()[:8] in html
    for heading in ['Signal', 'Gaps', 'Target', 'Attack', 'Next experiment', 'Provenance']:
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
    with pytest.raises(render.DetailUnavailableError):
        render.DefaultDrugDetail().get_drug_detail('piperacillin', None)


def test_future_detail_provider_receives_project(monkeypatch):
    seen = []
    def get_detail(drug_id, project_id):
        seen.append((drug_id, project_id))
        return {'name': 'real'}
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
    for value in ['Brinzolamide', 'CA2', 'P00918', 'Provenance', '3 hidden tests', 'not preregistered']:
        assert value in text
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
    from app.routes import reports
    payload = {'candidates': [{'candidate_id': 'BRD-1', 'name': '=FORMULA()', 'rank': 1,
                              'consensus': -1.7, 'n_contexts': 3, 'hidden': 'SECRET_OUTCOME'}]}
    monkeypatch.setattr(reports, 'get_repository', lambda: SimpleNamespace(list_candidates=lambda n: payload))
    response = client.get('/projects/builtin-gse132903/candidates.csv')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/csv')
    assert "'=FORMULA()" in response.text
    assert '-1.7' in response.text
    assert 'SECRET_OUTCOME' not in response.text
    assert client.get('/projects/upload/candidates.csv').status_code == 404


def test_pdf_suffix_is_not_html_drug_id(client, monkeypatch):
    monkeypatch.setattr(render, 'render_pdf', lambda html: b'%PDF-contract-stub')
    response = client.get('/reports/piperacillin.pdf')
    assert response.headers['content-type'] == 'application/pdf'
    assert response.content == b'%PDF-contract-stub'
