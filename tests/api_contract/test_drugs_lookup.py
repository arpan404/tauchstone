"""Contract tests for GET /drugs/{id} and POST /lookup (Track D1).

Mock mode validates the committed fixtures; the data-marked tests run the
same assertions through the real Parquet repository.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from app.deps import get_repository
from app.main import app
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check

DATA = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"

PIPERACILLIN = "BRD-K86873305"
NAMES = ["donepezil", "memantine", "galantamine", "rivastigmine", "nepafenac", "lithium"]


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_mock_drug_detail(client):
    r = client.get(f"/drugs/{PIPERACILLIN}")
    assert r.status_code == 200
    body = r.json()
    check(body, "DrugDetail")
    assert body["drug_id"] == PIPERACILLIN
    assert body["gaps"]["cancer_lines_only"]
    assert body["gaps"]["doses_um"] == [10.0]
    assert body["gaps"]["times_h"] == [6.0]
    assert body["gaps"]["exposure"]["label"] == "predicted low"
    assert not body["gaps"]["has_targets"]
    assert body["attack_ready"] and body["preregistered"]
    assert len(body["contexts"]) == 3
    assert body["molecule"] is not None and body["molecule"]["formula"] == "C23H27N5O7S"


def test_mock_drug_detail_404(client):
    r = client.get("/drugs/BRD-NOPE00000")
    assert r.status_code == 404
    assert set(r.json().keys()) == {"detail"}


def test_mock_lookup(client):
    r = client.post("/lookup", json={"names": NAMES})
    assert r.status_code == 200
    rows = r.json()
    assert [row["query"] for row in rows] == NAMES
    for row in rows:
        check(row, "LookupResult")
    by_query = {row["query"]: row for row in rows}
    assert by_query["donepezil"]["pool_rank"] == 684
    assert by_query["memantine"]["pool_rank"] == 502
    assert by_query["galantamine"]["pool_rank"] == 1214
    assert by_query["rivastigmine"]["status"] == "not_rankable"
    assert by_query["nepafenac"]["pool_rank"] == 2
    assert by_query["nepafenac"]["attack_ready"]
    assert by_query["lithium"]["status"] == "not_in_lincs"


def test_mock_lookup_unknown_and_empty(client):
    r = client.post("/lookup", json={"names": ["not-a-drug-xyz"]})
    assert r.status_code == 200
    assert r.json() == [{"query": "not-a-drug-xyz", "status": "not_in_lincs"}]
    assert client.post("/lookup", json={"names": []}).json() == []


@pytest.mark.data
def test_real_drug_detail():
    need = [
        "scores/GSE132903__main__compound_ranking.parquet",
        "scores/GSE132903__main__context_scores.parquet",
        "scores/GSE132903__main__candidate_pool.parquet",
        "evidence/gaps.parquet",
        "tauchstone/truth_table.parquet",
    ]
    missing = [f for f in need if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    repo = ParquetRepository(DATA)
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        client = TestClient(app)
        r = client.get(f"/drugs/{PIPERACILLIN}")
        assert r.status_code == 200
        body = r.json()
        check(body, "DrugDetail")
        assert body["gaps"]["cancer_lines_only"]
        assert body["gaps"]["doses_um"] == [10.0]
        assert body["gaps"]["times_h"] == [6.0]
        assert body["gaps"]["exposure"]["level"] == "predicted"
        assert body["gaps"]["exposure"]["label"] == "predicted low"
        assert not body["gaps"]["exposure"]["measured_available"]
        assert not body["gaps"]["has_targets"]
        assert body["attack_ready"]
        r2 = client.post("/lookup", json={"names": NAMES})
        assert r2.status_code == 200
        rows = r2.json()
        for row in rows:
            check(row, "LookupResult")
        by_query = {row["query"]: row for row in rows}
        assert by_query["donepezil"]["pool_rank"] == 684
        assert by_query["donepezil"]["consensus"] == pytest.approx(-0.24, abs=0.01)
        assert by_query["nepafenac"]["pool_rank"] == 2
        assert by_query["rivastigmine"]["status"] == "not_rankable"
        assert by_query["lithium"]["status"] == "not_in_lincs"
        # Measured exposure stays hidden: only the predicted label is exposed.
        assert body["gaps"]["exposure"]["level"] == "predicted"
        assert not body["gaps"]["exposure"]["measured_available"]
    finally:
        app.dependency_overrides.clear()
