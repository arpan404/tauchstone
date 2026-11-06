"""Leakage tests: hidden truth values never appear before a commit; held-out
signatures gate on revelation.

Note on method: hidden values live in the same numeric range as public ranking
data (e.g. claim theta equals the LINCS survive cutoff by construction), so a
global number search gives false positives. These tests assert structurally
(no value/threshold/outcome keys on unrevealed contexts) plus candidate-scoped
numeric absence (a candidate's own hidden values must not appear in its own
public payloads, where exact-float coincidence is effectively impossible).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.main import app
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
WORLD = json.load(open(ROOT / "contracts" / "fixtures" / "mock_world.json"))


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _walk(node, fn):
    if isinstance(node, dict):
        fn(node)
        for v in node.values():
            _walk(v, fn)
    elif isinstance(node, list):
        for v in node:
            _walk(v, fn)


def _floats(node, acc: set):
    if isinstance(node, dict):
        for v in node.values():
            _floats(v, acc)
    elif isinstance(node, list):
        for v in node:
            _floats(v, acc)
    elif isinstance(node, float):
        acc.add(node)


def test_no_hidden_keys_on_unrevealed_contexts(client):
    cid = WORLD["candidates"][0]["id"]
    bodies = [
        client.get("/candidates").json(),
        client.get(f"/candidates/{cid}/evidence").json(),
        client.get("/signatures/GSE132903").json(),
        client.post("/attack", json={"candidate_id": cid}).json(),
        client.get("/benchmark").json(),
    ]
    problems = []

    def check(d: dict):
        if "context_id" in d and "status" in d:
            for k in ("value", "threshold"):
                if k in d:
                    problems.append((d.get("context_id"), k))
            if d.get("outcome") not in (None,):
                problems.append((d.get("context_id"), f"outcome={d.get('outcome')}"))

    for b in bodies:
        _walk(b, check)
    assert not problems, problems


def test_candidate_hidden_values_absent_from_own_payloads(client):
    cid = WORLD["candidates"][0]["id"]
    hidden_vals = {
        r["value"] for r in WORLD["truth"][cid] if isinstance(r.get("value"), float)
    }
    state = client.post("/attack", json={"candidate_id": cid}).json()
    card = client.get(f"/candidates/{cid}/evidence").json()
    entry = next(
        c for c in client.get("/candidates").json()["candidates"] if c["id"] == cid
    )
    nums: set[float] = set()
    for payload in (state, card, entry):
        _floats(payload, nums)
    # claim theta is public by design (permutation-control cutoff), not a leak
    theta = state["claim"]["theta"]
    nums.discard(theta)
    leaked = {v for v in hidden_vals if v in nums and v != theta}
    assert not leaked, f"hidden values leaked: {leaked}"


def test_reveal_discloses_exactly_one_context(client):
    cid = WORLD["candidates"][1]["id"]
    s = client.post("/attack", json={"candidate_id": cid}).json()
    target = s["recommended_context_id"]
    r = client.post(f"/attack/{s['session_id']}/run", json={"context_id": target}).json()
    truth = {x["context_id"]: x for x in WORLD["truth"][cid]}
    assert r["revealed"]["outcome"] == truth[target]["outcome"]
    assert r["revealed"]["value"] == truth[target]["value"]
    assert r["revealed"]["threshold"] == truth[target]["threshold"]
    for ctx in r["contexts"]:
        if ctx["context_id"] != target:
            assert "value" not in ctx and "threshold" not in ctx


def test_held_out_signature_gating(client):
    cid = WORLD["candidates"][2]["id"]
    s = client.post("/attack", json={"candidate_id": cid, "budget": 5}).json()
    sid = s["session_id"]
    assert client.get("/signatures/GSE173955").status_code == 403
    assert client.get("/signatures/GSE173955", params={"session_id": "nope"}).status_code == 403
    assert client.get("/signatures/GSE173955", params={"session_id": sid}).status_code == 403
    # reveal an unrelated context: still gated
    other = next(c["context_id"] for c in s["contexts"] if c["type"] == "brain_exposure")
    client.post(f"/attack/{sid}/run", json={"context_id": other})
    assert client.get("/signatures/GSE173955", params={"session_id": sid}).status_code == 403
    # reveal the cohort context: now visible
    r = client.post(
        f"/attack/{sid}/run", json={"context_id": "held_out_cohort:GSE173955"}
    )
    assert r.status_code == 200
    g = client.get("/signatures/GSE173955", params={"session_id": sid})
    assert g.status_code == 200
    assert len(g.json()["genes"]) > 100


def test_evidence_shows_predicted_only(client):
    cid = WORLD["candidates"][0]["id"]
    card = client.get(f"/candidates/{cid}/evidence").json()
    assert card["brain_exposure"]["level"] == "predicted"
    truth_types = {r["context_type"] for r in WORLD["truth"][cid]}
    assert "brain_exposure" in truth_types  # measured value exists server-side only
