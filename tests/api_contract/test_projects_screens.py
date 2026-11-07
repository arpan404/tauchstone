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
    result = run_screen(pd.read_parquet(path), lambda n, total, top: updates.append((n, total)))
    expected = pd.read_parquet(PROCESSED / 'scores/GSE132903__main__compound_ranking.parquet')
    assert result.pert_id.tolist() == expected.pert_id.tolist()
    np.testing.assert_allclose(result.consensus_median, expected.consensus_median, rtol=0, atol=1e-9)
    assert len(updates) > 1 and updates[-1][0] == updates[-1][1]
