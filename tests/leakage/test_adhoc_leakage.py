"""POST /attack for a drug outside the truth table: hidden tests built on the fly.

Checks preregistered=false, the sealed path stays preregistered=true, the 404 detail, and that
no hidden outcome, value or threshold reaches the client before a committed reveal (fixture and
real data, e.g. donepezil).
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest
from app.deps import get_repository, get_session_store
from app.main import app
from app.services.repository import ParquetRepository
from app.services.sessions import SessionStore
from fastapi.testclient import TestClient

from pipelines.tauchstone.adhoc import build_adhoc_tests
from tests.api_contract.openapi_check import check
from tests.leakage._paths import PROCESSED, require
from tests.tauchstone.adhoc_fixture import ADHOC, SEALED, make_processed

DONEPEZIL = "BRD-A49160188"


def _client(base: Path) -> TestClient:
    repo = ParquetRepository(base)
    store = SessionStore()
    app.dependency_overrides[get_repository] = lambda: repo
    app.dependency_overrides[get_session_store] = lambda: store
    return TestClient(app)


def _floats(node: object, acc: set) -> None:
    if isinstance(node, dict):
        for v in node.values():
            _floats(v, acc)
    elif isinstance(node, list):
        for v in node:
            _floats(v, acc)
    elif isinstance(node, float):
        acc.add(node)


def _assert_no_leak(state: dict, hidden: list[dict]) -> None:
    for c in state["contexts"]:
        if c["status"] == "hidden":
            assert "value" not in c and "threshold" not in c, c
            assert c.get("outcome") is None, c
    nums: set[float] = set()
    _floats(state, nums)
    theta = state["claim"]["theta"]  # public by design
    secret = {
        float(r[k]) for r in hidden for k in ("value", "threshold")
        if isinstance(r.get(k), float) and math.isfinite(r[k]) and r[k] != theta
    }
    assert not (secret & nums), sorted(secret & nums)[:5]
    assert state["history"] == []


@pytest.fixture()
def fixture_client(tmp_path: Path):
    base = make_processed(tmp_path / "processed")
    yield _client(base), base
    app.dependency_overrides.clear()


def test_adhoc_attack_not_preregistered_and_no_leak(fixture_client):
    client, base = fixture_client
    r = client.post("/attack", json={"candidate_id": ADHOC})
    assert r.status_code == 200, r.text
    state = r.json()
    check(state, "AttackSession")
    assert state["preregistered"] is False
    hidden = build_adhoc_tests(ADHOC, base).to_dict(orient="records")
    assert len(state["contexts"]) == len(hidden) == 11
    _assert_no_leak(state, hidden)
    sid = state["session_id"]
    assert client.get("/signatures/GSE173955", params={"session_id": sid}).status_code == 403

    run = client.post(f"/attack/{sid}/run", json={"context_id": "GSE173955"})
    assert run.status_code == 200, run.text
    body = run.json()
    check(body, "RunResult")
    assert body["preregistered"] is False
    assert body["revealed"]["context_id"] == "GSE173955"
    assert body["revealed"]["outcome"] == "survive"
    shown = [c["context_id"] for c in body["contexts"] if c.get("outcome") is not None]
    assert shown == ["GSE173955"]


def test_sealed_attack_still_preregistered(fixture_client):
    client, _ = fixture_client
    state = client.post("/attack", json={"candidate_id": SEALED}).json()
    assert state["preregistered"] is True
    assert [c["context_id"] for c in state["contexts"]] == ["GSE173955"]  # sealed rows only


def test_no_hidden_tests_404(fixture_client):
    client, _ = fixture_client
    for cid in ("BRD-THIN", "BRD-NOPE"):
        r = client.post("/attack", json={"candidate_id": cid})
        assert r.status_code == 404
        assert r.json() == {"detail": "no hidden tests available for this drug"}


@pytest.mark.data
def test_real_adhoc_donepezil_no_leak():
    require("tauchstone/truth_table.parquet", "scores/GSE132903__main__context_scores.parquet",
            "scores/GSE173955__main__compound_ranking.parquet")
    client = _client(PROCESSED)
    try:
        r = client.post("/attack", json={"candidate_id": DONEPEZIL})
        assert r.status_code == 200, r.text
        state = r.json()
        check(state, "AttackSession")
        assert state["preregistered"] is False
        hidden = build_adhoc_tests(DONEPEZIL, PROCESSED).to_dict(orient="records")
        assert len(state["contexts"]) == len(hidden) > 0
        _assert_no_leak(state, hidden)
        sid = state["session_id"]
        assert client.get("/signatures/GSE173955", params={"session_id": sid}).status_code == 403
        nep = client.post("/attack", json={"candidate_id": "BRD-K04112579"}).json()
        assert nep["preregistered"] is True  # nepafenac: sealed truth table
    finally:
        app.dependency_overrides.clear()
