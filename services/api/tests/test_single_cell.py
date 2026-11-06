import json

from app.deps import get_repository
from app.main import app
from app.services.repository import MockRepository, ParquetRepository
from fastapi.testclient import TestClient


def test_single_cell_fixture():
    app.dependency_overrides[get_repository] = MockRepository
    try:
        response = TestClient(app).get('/exploratory/single-cell')
        assert response.status_code == 200
        assert response.json() == MockRepository().get_single_cell()
    finally:
        app.dependency_overrides.clear()


def test_real_missing_and_present(tmp_path):
    repo = ParquetRepository(tmp_path)
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        client = TestClient(app)
        response = client.get('/exploratory/single-cell')
        assert response.status_code == 404
        assert response.json() == {'detail': 'singlecell/panel.json'}
        path = tmp_path / 'singlecell/panel.json'
        path.parent.mkdir()
        panel = MockRepository().get_single_cell()
        path.write_text(json.dumps(panel))
        assert client.get('/exploratory/single-cell').json() == panel
    finally:
        app.dependency_overrides.clear()
