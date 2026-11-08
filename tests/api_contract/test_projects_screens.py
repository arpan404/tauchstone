"""Live job transport, upload validation and project contract checks."""
import json
from dataclasses import replace

import pandas as pd
import pytest
from app.main import app
from app.services import jobs, projects
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check


@pytest.fixture
def client(tmp_path, monkeypatch):
    cfg = replace(projects.settings, data_dir=tmp_path, mock=True)
    monkeypatch.setattr(projects, 'settings', cfg)
    monkeypatch.setattr(jobs, 'settings', cfg)
    return TestClient(app)


def test_endpoints_and_sse(client):
    ps = client.get('/projects').json()
    assert len(ps) == 2
    for p in ps:
        check(p, 'Project')
    p = client.post('/projects', json={'name': 'Upload'}).json()
    check(p, 'Project')
    assert not p['preregistered']
    initial = client.post('/screens', json={'project_id': p['id'], 'signature_id': 'GSE132903'}).json()
    check(initial, 'Screen')
    assert initial['status'] == 'queued'
    sid = initial['id']
    check(client.get(f'/screens/{sid}').json(), 'Screen')
    response = client.get(f'/screens/{sid}/events')
    assert response.headers['content-type'].startswith('text/event-stream')
    events = [json.loads(x[6:]) for x in response.text.splitlines() if x.startswith('data: ')]
    for e in events:
        check(e, 'ScreenEvent')
    states = [e['status'] for e in events]
    assert states[-1] == 'done'
    assert 'scoring' in states and 'aggregating' in states
    assert all(a['n_scored'] <= b['n_scored'] for a, b in zip(events, events[1:], strict=False))
    assert events[-1]['n_scored'] == events[-1]['n_signatures']
    result = client.get(f"/projects/{p['id']}/candidates").json()
    check(result, 'ProjectCandidates')
    assert result['candidates'] and not result['preregistered']
    for c in result['candidates']:
        check(c, 'ProjectCandidate')
    assert client.get(f"/projects/{p['id']}/candidates.csv").text.startswith('id,rank,')
    assert not client.get(f"/projects/{p['id']}/candidates?brain_cells=true").json()['candidates']
    assert not client.get(f"/projects/{p['id']}/candidates?min_contexts=100000").json()['candidates']
    assert client.get('/screens/absent').status_code == 404
    assert client.post('/screens', json={}).status_code == 422
    assert client.post('/screens', files={'file': ('bad.csv', b'gene,log2fc,fdr\nX,1,.01')},
                       data={'project_id': p['id']}).status_code == 422


def test_csv():
    genes = pd.DataFrame({'entrez_id': [str(i) for i in range(60)],
                          'symbol': [f'G{i}' for i in range(60)], 'is_landmark': True})
    csv = 'GENE,LOG2FC,FDR\n' + '\n'.join(f'G{i},1,.01' for i in range(60))
    df = projects.parse_csv(csv.encode(), genes)
    assert len(df) == 60 and df.entrez_id.iloc[0] == '0'
    assert df.stat.equals(df.log2fc)
    for text in ['gene,log2fc,fdr\nG0,1,.01', 'gene,stat\nG0,1', csv.replace('1,.01', 'nan,.01')]:
        with pytest.raises(HTTPException) as exc:
            projects.parse_csv(text.encode(), genes)
        assert exc.value.status_code == 422


@pytest.mark.data
def test_frozen_reproduction():
    import numpy as np

    from pipelines.common.paths import PROCESSED
    from pipelines.lincs.screen_job import run_screen
    path = PROCESSED / 'signatures/GSE132903__main.parquet'
    if not path.exists():
        pytest.skip('real data unavailable')
    updates = []
    result = run_screen(pd.read_parquet(path),
                        lambda n, total, top, cells: updates.append((n, total, cells)))
    expected = pd.read_parquet(PROCESSED / 'scores/GSE132903__main__compound_ranking.parquet')
    assert result.pert_id.tolist() == expected.pert_id.tolist()
    np.testing.assert_allclose(result.consensus_median, expected.consensus_median, rtol=0, atol=1e-9)
    assert len(updates) > 1 and updates[-1][0] == updates[-1][1]
    # Per-cell-line counts always add up to the rows scored so far.
    assert all(int(c.n_scored.sum()) == n for n, _, c in updates)
    cells = updates[-1][2]
    assert cells.n_scored.is_monotonic_decreasing and cells.cell_id.is_unique


def test_new_fixtures():
    from tests.api_contract.openapi_check import ROOT
    mapping = {'createProject': 'Project', 'getScreen': 'Screen', 'startScreen': 'Screen',
               'streamScreen': 'ScreenEvent', 'listProjectCandidates': 'ProjectCandidates'}
    for operation, schema in mapping.items():
        check(json.loads((ROOT / f'contracts/fixtures/{operation}.json').read_text()), schema)
    for project in json.loads((ROOT / 'contracts/fixtures/listProjects.json').read_text()):
        check(project, 'Project')


def test_uploaded_screen_and_persistence(client):
    project = client.post('/projects', json={'name': 'Uploaded CSV'}).json()
    world = json.loads(projects.MOCK_WORLD_PATH.read_text())
    genes = world['signatures']['GSE132903__main']['genes'][:60]
    content = 'gene,log2fc,stat,fdr\n' + '\n'.join(
        f"{g['symbol']},{g['log2fc']},{g['stat']},{g['fdr']}" for g in genes)
    response = client.post('/screens', data={'project_id': project['id']},
                           files={'file': ('signature.csv', content, 'text/csv')})
    assert response.status_code == 200, response.text
    screen = response.json()
    check(screen, 'Screen')
    assert screen['preregistered'] is False
    assert (projects.root() / f"{project['id']}-signature.parquet").exists()
    # Wait for the worker before the test's temporary store is removed.
    events = client.get(f"/screens/{screen['id']}/events").text
    assert json.loads(events.strip().split('data: ')[-1])['status'] == 'done'
    with projects.db() as db:
        assert db.execute('SELECT COUNT(*) FROM records WHERE kind=? AND id=?',
                          ('screen', screen['id'])).fetchone()[0] == 1


def test_gap_filters(client, monkeypatch):
    projects.seed()
    first = projects.mock_candidates()[0]['id']
    path = projects.base() / 'evidence'
    path.mkdir(parents=True)
    pd.DataFrame([dict(pert_id=first, brain_cells_json='[{"cell_id":"NEU"}]',
                       cancer_lines_only=False, exposure_label='predicted penetrant')]).to_parquet(
                           path / 'gaps.parquet')
    # Exercise real gap decoding with mock candidate rows, without loading other real data.
    cfg = replace(projects.settings, mock=False)
    monkeypatch.setattr(projects, 'settings', cfg)
    monkeypatch.setattr(projects, 'root', lambda: path.parent.parent / 'app' / 'mock')
    monkeypatch.setattr(projects, 'attack_ids', lambda: {first})
    pool = path.parent / 'scores'
    pool.mkdir()
    pd.DataFrame([dict(pert_id=first, pool_rank=1, drug_name='Example', consensus_median=-1.,
                       consensus_q25=-2., consensus_q75=0., n_ranking_contexts=5,
                       z_wtcs_median=-1., z_ks_median=-1., z_cosine_median=-1.,
                       max_clinical_stage='APPROVAL')]).to_parquet(pool / 'GSE132903__main__candidate_pool.parquet')
    result = projects.candidates('GSE132903', approved=True, brain_cells=True, penetrant=True, min_contexts=3)
    assert len(result['candidates']) == 1
    check(result, 'ProjectCandidates')
    assert result['candidates'][0]['attack_ready']
