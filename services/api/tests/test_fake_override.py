"""Route tests with the fake engine injected via dependency overrides."""

import importlib.util
from pathlib import Path

import pytest
from app.deps import get_engine_factory
from app.main import app
from fastapi.testclient import TestClient

_spec = importlib.util.spec_from_file_location(
    "fake_engine", Path(__file__).parent / "fake_engine.py"
)
assert _spec and _spec.loader
_fake = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_fake)
make_fake_session = _fake.make_fake_session


@pytest.fixture()
def client():
    # NOTE: overrides replace the dependency callable itself, so provide a
    # zero-arg provider returning the factory (FastAPI inspects its signature).
    app.dependency_overrides[get_engine_factory] = lambda: make_fake_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_fake_engine_roundtrip(client):
    s = client.post("/attack", json={"candidate_id": "MOCK-0001"}).json()
    assert s["belief"]["p_claim_holds"] == 0.5
    r = client.post(
        f"/attack/{s['session_id']}/run", json={"context_id": s["recommended_context_id"]}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["revealed"]["context_id"] == s["recommended_context_id"]
    assert body["revealed"]["outcome"] in ("survive", "fail")
    dup = client.post(
        f"/attack/{s['session_id']}/run", json={"context_id": s["recommended_context_id"]}
    )
    assert dup.status_code == 409
