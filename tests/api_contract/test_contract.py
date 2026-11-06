"""Contract tests: every endpoint's live response (mock mode) validated against
contracts/openapi.yaml schemas with jsonschema (OpenAPI 3.1 = JSON Schema 2020-12).
"""

from __future__ import annotations

import json

import pytest
from app.main import app
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import ROOT, check


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def first_candidate(client):
    body = client.get("/candidates").json()
    return body["candidates"][0]["id"]


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "mock": True}


def test_get_signature(client):
    r = client.get("/signatures/GSE132903")
    assert r.status_code == 200
    check(r.json(), "Signature")
    assert len(r.json()["genes"]) > 1000


def test_list_candidates(client):
    r = client.get("/candidates")
    assert r.status_code == 200
    check(r.json(), "CandidateList")
    ids = [c["id"] for c in r.json()["candidates"]]
    assert all(i.startswith("MOCK-") for i in ids)


def test_get_evidence(client, first_candidate):
    r = client.get(f"/candidates/{first_candidate}/evidence")
    assert r.status_code == 200
    check(r.json(), "EvidenceCard")


def test_start_attack(client, first_candidate):
    r = client.post("/attack", json={"candidate_id": first_candidate})
    assert r.status_code == 200
    check(r.json(), "AttackSession")


def test_run_experiment(client, first_candidate):
    s = client.post("/attack", json={"candidate_id": first_candidate}).json()
    r = client.post(
        f"/attack/{s['session_id']}/run", json={"context_id": s["recommended_context_id"]}
    )
    assert r.status_code == 200
    check(r.json(), "RunResult")


def test_get_benchmark(client):
    r = client.get("/benchmark")
    assert r.status_code == 200
    check(r.json(), "Benchmark")


def test_error_bodies(client):
    assert client.get("/candidates/NOPE/evidence").status_code == 404
    assert client.get("/candidates/NOPE/evidence").json().keys() == {"detail"}
    assert client.get("/signatures/GSE173955").status_code == 403
    assert set(client.get("/signatures/GSE173955").json().keys()) == {"detail"}
    assert client.post("/attack", json={"candidate_id": "NOPE"}).status_code == 404
    assert client.post("/attack/badsession/run", json={"context_id": "x"}).status_code == 404


def test_examples_match_contract():
    """contracts/fixtures/<operationId>.json examples also validate."""
    op_to_schema = {
        "getHealth": None, "getSignature": "Signature", "listCandidates": "CandidateList",
        "getEvidence": "EvidenceCard", "startAttack": "AttackSession",
        "runExperiment": "RunResult", "getBenchmark": "Benchmark",
    }
    for op, schema in op_to_schema.items():
        payload = json.load(open(ROOT / "contracts" / "fixtures" / f"{op}.json"))
        if schema:
            check(payload, schema)
