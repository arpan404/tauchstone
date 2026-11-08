"""Cell-line cards are served from local files only, in mock and real mode."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from app.main import app
from app.routes import cell_lines
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check

DATA = Path(cell_lines.settings.data_dir)


def test_mock_cards_match_contract(monkeypatch):
    monkeypatch.setattr(cell_lines, "settings", SimpleNamespace(mock=True))
    with TestClient(app) as client:
        body = client.get("/cell-lines").json()
        check(body, "CellLineList")
        ids = {c["cell_id"] for c in body["cell_lines"]}
        assert {"MCF7", "NEU", "NPC"} <= ids
        assert client.get("/cell-lines/MCF7/image").status_code == 404


def test_missing_table_is_404(tmp_path, monkeypatch):
    monkeypatch.setattr(cell_lines, "settings", SimpleNamespace(mock=False, data_dir=tmp_path))
    with TestClient(app) as client:
        assert client.get("/cell-lines").status_code == 404
        assert client.get("/cell-lines/MCF7/image").status_code == 404


@pytest.mark.data
def test_real_cards_and_image(monkeypatch):
    monkeypatch.setattr(cell_lines, "settings", SimpleNamespace(mock=False, data_dir=DATA))
    with TestClient(app) as client:
        body = client.get("/cell-lines").json()
        check(body, "CellLineList")
        cards = {c["cell_id"]: c for c in body["cell_lines"]}
        assert len(cards) == 83
        mcf7 = cards["MCF7"]
        assert mcf7["cellosaurus_id"] == "CVCL_0031"
        assert mcf7["summary"] == "Breast cancer cells, from a 69-year-old woman."
        assert mcf7["image"]["licence"] == "CC BY 4.0"
        img = client.get("/cell-lines/MCF7/image")
        assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
        assert cards["NEU"]["neural"] and cards["NEU"]["image"] is None
        assert client.get("/cell-lines/NEU/image").status_code == 404
        assert client.get("/cell-lines/..%2F..%2Fx/image").status_code == 404
