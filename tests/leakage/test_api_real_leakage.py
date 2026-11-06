"""Check 4 — the real API never serves hidden outcomes before a committed reveal.

With the Parquet repository (``TS_API_MOCK=0`` code path via dependency
override), starts a session for every truth-table candidate and asserts that no
pre-reveal response contains any hidden value, threshold or outcome — searched
over the serialized JSON. Held-out cohort signatures 403 before their reveal
and 200 after. Structure path traversal returns 404/422.
"""

from __future__ import annotations

import math

import duckdb
import pytest
from app.deps import get_repository
from app.main import app
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.leakage._paths import POOL, PROCESSED, TRUTH, needs_data, require

pytestmark = needs_data

NEED = [
    "signatures/GSE132903__main.parquet",
    "tauchstone/truth_table.parquet",
    "tauchstone/benchmark_summary.json",
    POOL,
]


def _floats(node: object, acc: set) -> None:
    if isinstance(node, dict):
        for v in node.values():
            _floats(v, acc)
    elif isinstance(node, list):
        for v in node:
            _floats(v, acc)
    elif isinstance(node, float):
        acc.add(node)


def _walk(node: object, fn) -> None:  # noqa: ANN001, ANN202
    if isinstance(node, dict):
        fn(node)
        for v in node.values():
            _walk(v, fn)
    elif isinstance(node, list):
        for v in node:
            _walk(v, fn)


@pytest.fixture(scope="module")
def client():
    require(*NEED)
    repo = ParquetRepository(PROCESSED)
    app.dependency_overrides[get_repository] = lambda: repo
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def candidate_ids():
    require(POOL, TRUTH)
    con = duckdb.connect()
    try:
        pool = con.execute(
            "SELECT pert_id FROM read_parquet(?) WHERE pool IN ('benchmark', 'development')",
            [str(PROCESSED / POOL)],
        ).fetchdf()
        truth = con.execute(
            "SELECT DISTINCT candidate_id FROM read_parquet(?)", [str(PROCESSED / TRUTH)]
        ).fetchdf()
    finally:
        con.close()
    pool_ids = set(pool["pert_id"].astype(str))
    truth_ids = set(truth["candidate_id"].astype(str))
    assert truth_ids == pool_ids, "truth table must cover exactly the two pools"
    return sorted(truth_ids)


@pytest.fixture(scope="module")
def hidden_numbers(candidate_ids):
    con = duckdb.connect()
    try:
        truth = con.execute(
            "SELECT candidate_id, value, threshold FROM read_parquet(?)", [str(PROCESSED / TRUTH)]
        ).fetchdf()
    finally:
        con.close()
    out: dict[str, set[float]] = {}
    for cid in candidate_ids:
        vals = set()
        sub = truth[truth["candidate_id"] == cid]
        for col in ("value", "threshold"):
            for v in sub[col].tolist():
                if v is not None and isinstance(v, float) and math.isfinite(v):
                    vals.add(float(v))
        out[cid] = vals
    return out


def _theta(client: TestClient, cid: str) -> float:
    return float(client.post("/attack", json={"candidate_id": cid}).json()["claim"]["theta"])


def test_no_hidden_keys_or_numbers_before_reveal(client, candidate_ids, hidden_numbers) -> None:
    theta = _theta(client, candidate_ids[0])
    problems: list[str] = []
    for cid in candidate_ids:
        state = client.post("/attack", json={"candidate_id": cid}).json()
        assert "session_id" in state, f"no session for {cid}: {state}"
        card = client.get(f"/candidates/{cid}/evidence").json()

        def check(d: dict, cid: str = cid) -> None:
            if "context_id" in d and "status" in d:
                for k in ("value", "threshold"):
                    if k in d:
                        problems.append(f"{cid}: {d.get('context_id')} leaks {k}")
                if d.get("outcome") is not None:
                    problems.append(f"{cid}: {d.get('context_id')} leaks outcome")

        _walk(state, check)
        assert state["history"] == [], f"{cid}: fresh session must have empty history"
        nums: set[float] = set()
        _floats(state, nums)
        _floats(card, nums)
        nums.discard(theta)  # claim theta is public by design, not a leak
        leaked = {v for v in hidden_numbers[cid] if v in nums and v != theta}
        if leaked:
            problems.append(f"{cid}: hidden numbers in pre-reveal payloads: {sorted(leaked)[:5]}")
    assert not problems, "\n".join(problems[:20])


def test_held_out_gating_all_candidates(client, candidate_ids) -> None:
    failures: list[str] = []
    for cid in candidate_ids:
        sid = client.post("/attack", json={"candidate_id": cid}).json()["session_id"]
        if client.get("/signatures/GSE173955", params={"session_id": sid}).status_code != 403:
            failures.append(f"{cid}: held-out signature visible before reveal")
            continue
        r = client.post(f"/attack/{sid}/run", json={"context_id": "GSE173955"})
        if r.status_code != 200:
            failures.append(f"{cid}: cohort reveal failed: {r.status_code}")
            continue
        g = client.get("/signatures/GSE173955", params={"session_id": sid})
        if g.status_code != 200:
            failures.append(f"{cid}: held-out signature gated after reveal")
        # The reveal discloses exactly one context; nothing else gains value/threshold keys.
        leaked = [c["context_id"] for c in r.json()["contexts"] if "value" in c or "threshold" in c]
        if [c for c in leaked if c != "GSE173955"]:
            failures.append(f"{cid}: reveal leaked extra contexts: {leaked}")
    assert not failures, "\n".join(failures[:20])


def test_evidence_cards_show_no_measured_exposure(client, candidate_ids) -> None:
    bad = []
    for cid in candidate_ids:
        level = client.get(f"/candidates/{cid}/evidence").json()["brain_exposure"]["level"]
        if level not in ("predicted", "none"):
            bad.append(f"{cid}: level={level}")
    assert not bad, "\n".join(bad[:20])


@pytest.mark.parametrize(
    "path",
    [
        "/structures/..%2F..%2Fetc%2Fpasswd.cif",
        "/structures/%2e%2e.cif",
        "/structures/%2e%2e%2fapp.cif",
        "/structures/....cif",
        "/structures/ABCD.cif",
    ],
)
def test_structure_path_traversal_rejected(client, path: str) -> None:
    r = client.get(path)
    assert r.status_code in (404, 422), f"{path} -> {r.status_code}"
    body = r.text
    assert "root:" not in body, f"{path} served file contents"
