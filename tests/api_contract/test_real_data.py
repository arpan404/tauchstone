"""Real-data smoke test (TS_API_MOCK=0 equivalent).

Forces the Parquet repository via dependency override, so it runs the real
code path regardless of env. Skips when the processed files are absent.
Validates every endpoint against contracts/openapi.yaml and asserts no hidden
outcome leaks for a real candidate.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import duckdb
import pytest
from app.deps import get_repository
from app.main import app
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check

DATA = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"
NEED = [
    "signatures/GSE132903__main.parquet",
    "signatures/GSE132903__composition_adjusted.parquet",
    "signatures/GSE173955__main.parquet",
    "scores/GSE132903__main__candidate_pool.parquet",
    "scores/GSE132903__main__context_scores.parquet",
    "tauchstone/truth_table.parquet",
    "tauchstone/benchmark_summary.json",
]

pytestmark = pytest.mark.data


def _truth_rows(candidate_id: str) -> list[dict]:
    con = duckdb.connect()
    try:
        cur = con.execute(
            "SELECT * FROM read_parquet(?) WHERE candidate_id = ?",
            [str(DATA / "tauchstone" / "truth_table.parquet"), candidate_id],
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    finally:
        con.close()


@pytest.fixture(scope="module")
def client():
    missing = [f for f in NEED if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    repo = ParquetRepository(DATA)
    app.dependency_overrides[get_repository] = lambda: repo
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def demo_ids(client):
    body = client.get("/candidates", params={"limit": 50}).json()
    by_rank = {c["rank"]: c["id"] for c in body["candidates"]}
    return [by_rank[1], by_rank[5], by_rank[12]]


def test_real_signature(client):
    r = client.get("/signatures/GSE132903")
    assert r.status_code == 200
    check(r.json(), "Signature")
    assert len(r.json()["genes"]) > 15000
    assert r.json()["n_ad"] == 97 and r.json()["n_control"] == 98
    symbols = {g["symbol"] for g in r.json()["genes"] if g.get("query_set") is not None}
    assert len(symbols) == 300  # 150 up + 150 down LINCS query sets
    sign = {s["symbol"]: s for s in r.json()["sign_check"]}
    assert len(sign) == 7 and all(s["matches"] for s in sign.values())
    r2 = client.get("/signatures/GSE132903", params={"variant": "composition_adjusted"})
    assert r2.status_code == 200
    check(r2.json(), "Signature")


def test_real_candidates(client):
    r = client.get("/candidates", params={"limit": 50})
    assert r.status_code == 200
    check(r.json(), "CandidateList")
    assert r.json()["signature"] == "GSE132903__main"
    assert r.json()["n_ranked"] > 100
    c1 = r.json()["candidates"][0]
    assert c1["rank"] == 1 and c1["is_demo_candidate"] is True
    assert not c1["id"].startswith("MOCK-")
    assert c1["by_cell_line"], "heatmap must have ranking cells"


def test_real_evidence(client, demo_ids):
    r = client.get(f"/candidates/{demo_ids[0]}/evidence")
    assert r.status_code == 200
    check(r.json(), "EvidenceCard")
    assert r.json()["brain_exposure"]["level"] in ("predicted", "none")
    struct = r.json().get("structure")
    if struct:
        assert struct["note"].startswith("Target context only")
        s = client.get(struct["url"])
        assert s.status_code == 200


def test_real_attack_no_leak_then_reveal(client, demo_ids):
    cid = demo_ids[0]
    s = client.post("/attack", json={"candidate_id": cid}).json()
    check(s, "AttackSession")
    for ctx in s["contexts"]:
        assert "value" not in ctx and "threshold" not in ctx
        assert ctx.get("outcome") is None
    assert s["history"] == []
    truth = {t["context_id"]: t for t in _truth_rows(cid)}
    assert {c["context_id"] for c in s["contexts"]} == set(truth)
    target = s["recommended_context_id"]
    r = client.post(f"/attack/{s['session_id']}/run", json={"context_id": target}).json()
    check(r, "RunResult")
    assert r["revealed"]["outcome"] == truth[target]["outcome"]
    for ctx in r["contexts"]:
        if ctx["context_id"] != target:
            assert "value" not in ctx and "threshold" not in ctx
    # measured exposure summaries must not appear on the public card
    card_text = json.dumps(client.get(f"/candidates/{cid}/evidence").json())
    con = duckdb.connect()
    try:
        rows = con.execute(
            "SELECT summary FROM read_parquet(?) WHERE pert_id = ? AND is_measured = TRUE",
            [str(DATA / "evidence" / "exposure.parquet"), cid],
        ).fetchall()
    finally:
        con.close()
    for (summary,) in rows:
        assert summary not in card_text


def test_real_held_out_gating(client, demo_ids):
    s = client.post("/attack", json={"candidate_id": demo_ids[1]}).json()
    sid = s["session_id"]
    assert client.get("/signatures/GSE173955", params={"session_id": sid}).status_code == 403
    r = client.post(f"/attack/{sid}/run", json={"context_id": "GSE173955"})
    assert r.status_code == 200
    g = client.get("/signatures/GSE173955", params={"session_id": sid})
    assert g.status_code == 200
    check(g.json(), "Signature")


def test_real_benchmark_and_unknown_candidate(client):
    r = client.get("/benchmark")
    assert r.status_code == 200
    check(r.json(), "Benchmark")
    assert "decision_lookahead_hybrid" in [p["policy"] for p in r.json()["policies"]]
    e = client.post("/attack", json={"candidate_id": "BRD-NOPE-NOTREAL"})
    assert e.status_code == 404
    assert e.json() == {"detail": "no hidden tests available for this drug"}
