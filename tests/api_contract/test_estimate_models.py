"""GET /compounds/estimate/models: stored structure model comparison, read-only."""
from __future__ import annotations

import json
from types import SimpleNamespace

from app.main import app
from app.routes import compounds_estimate as route
from fastapi.testclient import TestClient

from pipelines.common.provenance import Provenance
from tests.api_contract.openapi_check import check

client = TestClient(app)
FIXTURE = json.loads(route.COMPARISON_FIXTURE.read_text())


def stored(tmp_path):
    rows = [{'name': 'rf_served', 'label': 'Random forest', 'n': 3, 'mae': .4, 'baseline_mae': .5, 'r2': .1,
             'spearman': .2},
            {'name': 'mlp', 'label': 'Neural network', 'n': 3, 'mae': .45, 'baseline_mae': .5, 'r2': .05,
             'spearman': .1, 'passes_rule': False,
             'vs_served': {'spearman': -.1, 'spearman_ci95': [-.3, .1], 'mae': .05, 'mae_ci95': [0, .1]}}]
    result = {'preregistered': False, 'rule': 'r', 'served': 'rf_served', 'outcome': 'kept',
              'test_set': {'n_compounds': 3, 'n_groups': 2}, 'bootstrap': {'unit': 'scaffold group', 'n': 2000,
                                                                            'seed': 20261108}, 'models': rows}
    path = tmp_path / route.COMPARISON
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(result))
    Provenance(step='structure_bakeoff_comparison', dataset_accession='GSE132903').write(path)
    return path


def test_mock_fixture_matches_contract(monkeypatch):
    monkeypatch.setattr(route, 'settings', SimpleNamespace(mock=True))
    response = client.get('/compounds/estimate/models')
    assert response.status_code == 200
    check(response.json(), 'EstimateModels')
    body = response.json()
    assert sum(r['served'] for r in body['models']) == 1
    assert body['bootstrap']['seed'] == 20261108


def test_real_mode_reads_verified_file(monkeypatch, tmp_path):
    stored(tmp_path)
    monkeypatch.setattr(route, 'settings', SimpleNamespace(mock=False, data_dir=tmp_path))
    body = client.get('/compounds/estimate/models').json()
    check(body, 'EstimateModels')
    assert [r['served'] for r in body['models']] == [True, False]
    assert body['models'][1]['spearman_vs_served_ci95'] == [-.3, .1]
    assert body['models'][0]['passes_rule'] is None


def test_404_when_missing_or_tampered(monkeypatch, tmp_path):
    monkeypatch.setattr(route, 'settings', SimpleNamespace(mock=False, data_dir=tmp_path))
    assert client.get('/compounds/estimate/models').status_code == 404
    path = stored(tmp_path)
    path.write_text(path.read_text().replace('kept', 'won'))
    assert client.get('/compounds/estimate/models').status_code == 404
