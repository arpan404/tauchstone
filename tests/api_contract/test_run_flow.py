"""Run-flow tests: budget, belief updates, history, 409/404 edges, done flag."""

from __future__ import annotations

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _start(client, budget=5, mode="attack"):
    return client.post(
        "/attack", json={"candidate_id": "MOCK-0003", "budget": budget, "mode": mode}
    ).json()


def test_run_flow_twice(client):
    s = _start(client)
    assert s["budget_remaining"] == 5 and s["history"] == []
    first = s["recommended_context_id"]
    r1 = client.post(f"/attack/{s['session_id']}/run", json={"context_id": first}).json()
    assert r1["budget_remaining"] == 4
    assert len(r1["history"]) == 1
    assert r1["revealed"]["context_id"] == first
    assert r1["revealed"]["outcome"] in ("survive", "fail")
    assert set(r1["revealed"]) >= {
        "outcome", "value", "threshold", "rule", "belief_before", "belief_after",
    }
    second = r1["recommended_context_id"]
    assert second != first
    r2 = client.post(f"/attack/{s['session_id']}/run", json={"context_id": second}).json()
    assert r2["budget_remaining"] == 3
    assert len(r2["history"]) == 2
    assert r2["done"] is False


def test_rerun_revealed_is_409(client):
    s = _start(client)
    cid = s["recommended_context_id"]
    assert client.post(f"/attack/{s['session_id']}/run", json={"context_id": cid}).status_code == 200
    r = client.post(f"/attack/{s['session_id']}/run", json={"context_id": cid})
    assert r.status_code == 409
    assert "detail" in r.json()


def test_unknown_context_is_409(client):
    s = _start(client)
    r = client.post(f"/attack/{s['session_id']}/run", json={"context_id": "lincs_context:XXX"})
    assert r.status_code == 409


def test_budget_exhaustion_sets_done(client):
    s = _start(client, budget=2)
    # run two recommended experiments sequentially
    r1 = client.post(f"/attack/{s['session_id']}/run", json={"context_id": s["recommended_context_id"]}).json()
    r2 = client.post(
        f"/attack/{s['session_id']}/run", json={"context_id": r1["recommended_context_id"]}
    ).json()
    assert r2["budget_remaining"] == 0
    assert r2["done"] is True
    r3 = client.post(
        f"/attack/{s['session_id']}/run", json={"context_id": r2["recommended_context_id"] or "x"}
    )
    assert r3.status_code == 409


def test_mode_toggle(client):
    s = _start(client, mode="attack")
    r = client.post(
        f"/attack/{s['session_id']}/run",
        json={"context_id": s["recommended_context_id"], "mode": "learn"},
    ).json()
    assert r["mode"] == "learn"
    assert r["revealed"]["mode_used"] == "learn"
