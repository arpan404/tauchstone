"""Resource agreement endpoint must work from local files with networking off."""
from __future__ import annotations

from types import SimpleNamespace

import pandas as pd
import pytest
from app.main import app
from app.routes import resources
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check


def checked_get(client, drug_id):
    response = client.get(f"/drugs/{drug_id}/resources")
    assert response.status_code == 200
    result = response.json()
    assert len(result) == 3
    assert {r["resource"] for r in result} == set(resources.RESOURCES)
    for row in result:
        check(row, "ResourceAgreement")
        assert "pert_id" not in row
        assert "not preregistered" in row["note"]
    return result


def test_mock_resources_and_unknown_drug(monkeypatch):
    monkeypatch.setattr(resources, "settings", SimpleNamespace(mock=True))
    with TestClient(app) as client:
        first_id = client.get("/candidates").json()["candidates"][0]["id"]
        result = checked_get(client, first_id)
        assert result[0]["rank"] == 1
        assert result[2]["status"] == "needs_key"
        for drug in ("NOPE", "BRD-K34098590"):
            assert all(r["status"] == "not_fetched" for r in checked_get(client, drug))


def test_missing_parquet_and_missing_drug(tmp_path, monkeypatch):
    monkeypatch.setattr(resources, "settings", SimpleNamespace(mock=False, data_dir=tmp_path))
    with TestClient(app) as client:
        assert all(r["status"] == "not_fetched" for r in checked_get(client, "BRD-1"))
        folder = tmp_path / "processed/resources"
        folder.mkdir(parents=True)
        pd.DataFrame([{"pert_id": "BRD-other", "resource": "clue", "status": "needs_key"}]).to_parquet(
            folder / "agreement.parquet", index=False)
        assert all(r["status"] == "not_fetched" for r in checked_get(client, "BRD-1"))


def test_parquet_read_partial_resources_and_nulls(tmp_path, monkeypatch):
    monkeypatch.setattr(resources, "settings", SimpleNamespace(mock=False, data_dir=tmp_path))
    folder = tmp_path / "processed/resources"
    folder.mkdir(parents=True)
    pd.DataFrame([
        {"pert_id": "BRD-1", "resource": "perturb_seqr", "status": "available", "rank": 7,
         "n_ranked": 200, "score": .01, "note": "not preregistered; report-only"},
        {"pert_id": "BRD-2", "resource": "perturb_seqr", "status": "not_found", "rank": None,
         "n_ranked": 200, "score": None, "note": "not preregistered; report-only"},
    ]).to_parquet(folder / "agreement.parquet", index=False)
    with TestClient(app) as client:
        result = checked_get(client, "BRD-1")
        assert result[1]["score"] == .01
        assert result[1]["rank"] == 7
        assert result[0]["status"] == "not_fetched"
        result = checked_get(client, "BRD-2")
        assert result[1]["score"] is None
        assert result[1]["rank"] is None


@pytest.mark.data
def test_real_resources_offline_contract(monkeypatch):
    from pipelines.common.paths import DATA_DIR
    if not (DATA_DIR / "processed/resources/agreement.parquet").exists():
        pytest.skip("real resource cache unavailable")
    monkeypatch.setattr(resources, "settings", SimpleNamespace(mock=False, data_dir=DATA_DIR))
    with TestClient(app) as client:
        result = checked_get(client, "BRD-K34098590")
        assert result[0]["status"] == "available"
        assert result[0]["rank"] == 1
