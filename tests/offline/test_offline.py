"""Offline expo-stack tests. Run only when TS_OFFLINE_TEST=1 with the stack up:

    make up
    TS_OFFLINE_TEST=1 uv run pytest tests/offline/ -q
"""

import json
import os
import urllib.error
import urllib.request

import pytest

BASE = "http://localhost:8080"

pytestmark = pytest.mark.skipif(
    os.environ.get("TS_OFFLINE_TEST") != "1",
    reason="needs the offline expo stack (make up) + TS_OFFLINE_TEST=1",
)


def get(path):
    req = urllib.request.Request(BASE + path, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def test_health_is_real_mode():
    status, body = get("/api/health")
    assert status == 200
    assert body["mock"] is False


def test_primary_signature_and_pool():
    status, sig = get("/api/signatures/GSE132903")
    assert status == 200
    assert sig["cohort"] == "GSE132903"
    status, cl = get("/api/candidates?limit=50")
    assert status == 200
    ranks = {c["rank"] for c in cl["candidates"]}
    assert {1, 5, 12} <= ranks


def test_held_out_gated_before_reveal():
    status, _ = get("/api/signatures/GSE173955")
    assert status == 403


def test_benchmark_served():
    status, bench = get("/api/benchmark")
    assert status == 200
    assert bench
