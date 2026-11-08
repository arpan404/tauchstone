"""Project scoping: unscreened 409, uploads validated before a project exists, deletes,
built-in reuse, frozen identity on re-screen and the per-project drug overlay."""
import json
from dataclasses import replace

import pytest
from app.main import app
from app.services import drug_detail, jobs, projects
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    cfg = replace(projects.settings, data_dir=tmp_path, mock=True)
    monkeypatch.setattr(projects, 'settings', cfg)
    monkeypatch.setattr(jobs, 'settings', cfg)
    return TestClient(app)


def _csv(n=60):
    world = json.loads(projects.MOCK_WORLD_PATH.read_text())
    genes = world['signatures']['GSE132903__main']['genes'][:n]
    return 'gene,log2fc,stat,fdr\n' + '\n'.join(
        f"{g['symbol']},{g['log2fc']},{g['stat']},{g['fdr']}" for g in genes)


def _finish(client, screen_id):
    events = client.get(f'/screens/{screen_id}/events').text
    return json.loads(events.strip().split('data: ')[-1])


def test_unscreened_project_is_409(client):
    r = client.get('/projects/GSE173955/candidates')
    assert r.status_code == 409 and r.json()['detail'] == 'Project not screened'
    assert client.get('/projects/GSE173955/candidates.csv').status_code == 409


def test_builtin_signature_reuses_its_project(client):
    before = len(client.get('/projects').json())
    p = client.post('/projects', json={'name': 'Copy', 'signature_id': 'GSE173955'}).json()
    assert p['id'] == 'GSE173955' and p['kind'] == 'builtin'
    assert len(client.get('/projects').json()) == before


def test_bad_upload_creates_no_project(client):
    before = len(client.get('/projects').json())
    r = client.post('/screens', data={'name': 'bad'},
                    files={'file': ('bad.csv', _csv(7), 'text/csv')})
    assert r.status_code == 422
    assert r.json()['detail'] == 'Only 7 landmark genes mapped; at least 50 required'
    assert len(client.get('/projects').json()) == before


def test_upload_by_name_then_delete(client):
    r = client.post('/screens', data={'name': 'My signature'},
                    files={'file': ('sig.csv', _csv(), 'text/csv')})
    assert r.status_code == 200, r.text
    screen = r.json()
    assert _finish(client, screen['id'])['status'] == 'done'
    pid = screen['project_id']
    project = next(p for p in client.get('/projects').json() if p['id'] == pid)
    assert project['name'] == 'My signature' and project['kind'] == 'upload'
    assert project['last_screen_id'] == screen['id'] and not project['preregistered']
    cands = client.get(f'/projects/{pid}/candidates').json()
    assert cands['candidates'] and not cands['preregistered']
    assert not any(c['attack_ready'] for c in cands['candidates'])
    # Uploads never go into a built-in project.
    assert client.post('/screens', data={'project_id': 'GSE173955'},
                       files={'file': ('sig.csv', _csv(), 'text/csv')}).status_code == 422
    assert client.delete('/projects/GSE132903').status_code == 403
    assert client.delete(f'/projects/{pid}').json() == {'id': pid, 'deleted': True}
    assert client.delete(f'/projects/{pid}').status_code == 404
    assert not (projects.root() / f'{pid}-signature.parquet').exists()
    assert client.get(f"/screens/{screen['id']}").status_code == 404


def test_failed_first_screen_discards_new_project(client, monkeypatch):
    client.get('/projects')  # seed before scoring is broken

    def boom():
        raise RuntimeError('scoring failed')
    monkeypatch.setattr(projects, 'mock_candidates', boom)
    screen = client.post('/screens', data={'name': 'doomed'},
                         files={'file': ('sig.csv', _csv(), 'text/csv')}).json()
    final = _finish(client, screen['id'])
    assert final['status'] == 'failed' and final['error'] == 'scoring failed'
    assert screen['project_id'] not in {p['id'] for p in client.get('/projects').json()}


def test_rescreen_keeps_frozen_identity(client):
    frozen = next(p for p in client.get('/projects').json() if p['id'] == 'GSE132903')
    screen = client.post('/screens', json={'project_id': 'GSE132903', 'signature_id': 'GSE132903'}).json()
    assert screen['preregistered'] is True
    assert _finish(client, screen['id'])['status'] == 'done'
    after = next(p for p in client.get('/projects').json() if p['id'] == 'GSE132903')
    assert after['last_screen_id'] == frozen['last_screen_id'] == 'frozen-GSE132903'
    assert after['n_ranked'] == frozen['n_ranked'] and after['preregistered']


def test_template_passes_validation(client):
    r = client.get('/screens/template.csv')
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/csv')
    assert r.text.startswith('gene,log2fc,stat,fdr')
    assert len(projects.parse_csv(r.content)) >= 50


def test_drug_overlay_for_projects(client):
    detail = {'drug_id': 'X', 'pool_rank': 1, 'rank_total': 1816, 'consensus': -2.0,
              'n_contexts': 4, 'preregistered': True, 'attack_ready': True}
    assert drug_detail.project_overlay(detail, None) is detail
    assert drug_detail.project_overlay(detail, 'GSE132903') is detail
    unscreened = drug_detail.project_overlay(detail, 'GSE173955')
    assert unscreened['pool_rank'] is None and unscreened['preregistered'] is False
    screen = client.post('/screens', data={'name': 'up'},
                         files={'file': ('sig.csv', _csv(), 'text/csv')}).json()
    _finish(client, screen['id'])
    row = projects.mock_candidates()[2]
    out = drug_detail.project_overlay(dict(detail, drug_id=row['id']), screen['project_id'])
    assert out['pool_rank'] == row['rank'] and out['consensus'] == row['consensus']
    assert out['rank_total'] == len(projects.mock_candidates()) and out['preregistered'] is False
    missing = drug_detail.project_overlay(dict(detail, drug_id='absent'), screen['project_id'])
    assert missing['pool_rank'] is None and missing['rank_total'] == out['rank_total']
    with pytest.raises(Exception, match='project not found'):
        drug_detail.project_overlay(detail, 'nope')
