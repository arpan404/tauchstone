import json
import threading
from types import SimpleNamespace

from app.deps import get_repository, get_session_store
from app.main import app
from app.routes import lab
from app.services.sessions import SessionStore
from fastapi.testclient import TestClient


class MaliciousRepo:
    def list_candidates(self, limit):
        assert limit == 200
        return {"candidates": [{"id": "other", "consensus": "SECRET_OTHER"}, {
            "id": "x", "name": "Example", "rank": 3, "consensus": -0.42,
            "n_ranking_contexts": 7, "n_held_out_contexts": "SECRET_HELDOUT",
            "scores": {"wtcs": -0.4, "ks": -0.3, "cosine": -0.5, "hidden": "SECRET_SCORE"},
            "consensus_iqr": [-0.6, -0.2], "flags": ["few_contexts", "SECRET_FLAG"],
            "truth": "SECRET_TRUTH"}]}

    def get_attack_world(self, *_):
        raise AssertionError("Never inspect truth")

    def get_evidence(self, candidate_id):
        return {"candidate_id": candidate_id, "name": "Example", "mechanism": "MAPK inhibitor",
                "brain_exposure": {"summary": "SECRET_EXPOSURE"}, "hidden": "SECRET_TRUTH",
                "targets": [{"symbol": "MAPK", "uniprot": "P12345", "hidden": "SECRET_TARGET",
                             "sources": [{"label": "ChEMBL", "url": "https://example.org"}]}]}


def test_grounded_real_payload(monkeypatch):
    def provider(path, payload):
        wire = json.dumps(payload)
        assert "SECRET" not in wire
        assert "brain_exposure" not in wire
        assert payload["think"] is False
        rows = json.loads(payload["messages"][1]["content"])["sources"]
        return {"message": {"content": json.dumps({"citation_ids": [rows[0]["id"]]})}}
    monkeypatch.setattr(lab, "ollama", provider)
    app.dependency_overrides[get_repository] = MaliciousRepo
    try:
        r = TestClient(app).post("/lab/chat", json={"candidate_id": "x", "question": "MAPK mechanism"})
        assert r.status_code == 200
        body = r.json()
        assert body["mode"] == "generated"
        assert body["citations"][0]["excerpt"] in body["answer"]
    finally:
        app.dependency_overrides.clear()


def test_fallback_and_hallucinations(monkeypatch):
    app.dependency_overrides[get_repository] = MaliciousRepo
    try:
        for output in (None, '{"citation_ids":["invented"]}',
                       '{"citation_ids":["S2"],"answer":"Treats AD with 99% efficacy"}', "x" * 2100):
            def provider(*args, output=output):
                if output is None:
                    raise OSError("Offline")
                return {"message": {"content": output}}
            monkeypatch.setattr(lab, "ollama", provider)
            body = TestClient(app).post("/lab/chat", json={"candidate_id": "x", "question": "MAPK"}).json()
            assert body["mode"] == "evidence_search"
            assert "99%" not in body["answer"].lower()
            assert "treats" not in body["answer"].lower()
            assert len(body["answer"]) < 4500
        body = TestClient(app).post("/lab/chat", json={"candidate_id": "x", "question": "zzzzzz"}).json()
        assert body["citations"] == []
    finally:
        app.dependency_overrides.clear()


def test_training_duplicate_failure_restore(tmp_path, monkeypatch):
    manager = lab.Training(tmp_path)
    entered, release = threading.Event(), threading.Event()
    calls = []

    def train(*args, **kwargs):
        calls.append(kwargs)
        entered.set()
        release.wait(3)
        raise ValueError("PRIVATE_PATH")

    monkeypatch.setattr(lab.importlib, "import_module", lambda _: SimpleNamespace(train_model=train))
    assert manager.start(lab.TrainRequest())["status"] == "training"
    assert entered.wait(2)
    assert manager.start(lab.TrainRequest())["status"] == "training"
    release.set()
    # Synchronize with completion without timing-dependent sleeps.
    for thread in threading.enumerate():
        if thread.name.endswith("(run)"):
            thread.join(3)
    assert len(calls) == 1
    assert manager.get()["status"] == "failed"
    assert "PRIVATE_PATH" not in manager.get()["error"]
    path = tmp_path / "processed/models/exploratory/report.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(dict(
        run_id="restored", created_at="2026-11-06", algorithm="random_forest", task="regression",
        seed=20261105, n_train=5, n_test=2, n_excluded=0, split={}, feature_count=10,
        metrics={"mae": 1., "baseline_mae": 2., "r2": 0., "spearman": None},
        training_sources=[], limitations=[], provenance={},
    )))
    assert lab.Training(tmp_path).get()["report"]["run_id"] == "restored"


def test_status_and_validation(monkeypatch):
    monkeypatch.setattr(lab, "ollama", lambda _: {"models": [{"name": "qwen3:4b"}]})
    client = TestClient(app)
    assert client.get("/lab/status").json()["copilot"]["ready"]
    assert client.post("/lab/model/train", json={"algorithm": "other"}).status_code == 422
    monkeypatch.setattr(lab, "ollama", lambda _: {"models": []})
    assert not client.get("/lab/status").json()["copilot"]["ready"]


def test_model_endpoints_and_failed_import(tmp_path, monkeypatch):
    manager = lab.Training(tmp_path)
    monkeypatch.setattr(lab, "training", manager)
    client = TestClient(app)
    assert client.get("/lab/model").json() == {"status": "not_trained"}
    assert client.post("/lab/model/predict", json={"candidate_id": "x"}).status_code == 409
    manager.state = {"status": "ready"}
    monkeypatch.setattr(lab.importlib, "import_module", lambda _: SimpleNamespace(
        predict_candidate=lambda *_: dict(candidate_id="x", prediction=-0.1,
                                         training_membership="unseen", run_id="r", private="hidden")))
    body = client.post("/lab/model/predict", json={"candidate_id": "x"}).json()
    assert body == dict(candidate_id="x", prediction=-0.1, training_membership="unseen", run_id="r")
    def missing(_):
        raise ImportError("Not integrated yet")
    monkeypatch.setattr(lab.importlib, "import_module", missing)
    manager.run(lab.TrainRequest())
    assert client.get("/lab/model").json()["status"] == "failed"


def test_provider_unavailable_status(monkeypatch):
    def offline(*_):
        raise OSError("Private diagnostic")
    monkeypatch.setattr(lab, "ollama", offline)
    body = TestClient(app).get("/lab/status").json()["copilot"]
    assert not body["ready"]
    assert "Private" not in body["detail"]


def test_discovery_coverage_and_readable_excerpts():
    rows = lab.sources(MaliciousRepo(), "x")
    wire = json.dumps(rows)
    assert "SECRET" not in wire
    assert "held_out" not in wire
    discovery = next(r for r in rows if "Discovery" in r["title"])
    assert "consensus: -0.42" in discovery["excerpt"].lower()
    assert "wtcs score: -0.4" in discovery["excerpt"].lower()
    assert "consensus iqr: -0.6 to -0.2" in discovery["excerpt"].lower()
    coverage = next(r for r in rows if "coverage" in r["title"])
    assert "available target count: 1" in coverage["excerpt"].lower()
    assert "unknown, not negative" in coverage["excerpt"].lower()


def test_committed_history_and_session_mismatch(monkeypatch):
    class Engine:
        def state(self):
            return {"history": [{
                "context_id": "committed-1", "label": "Committed cohort", "type": "held_out_cohort",
                "outcome": "fail", "value": -0.03, "threshold": -0.2, "rule": "value below threshold",
                "belief_before": 0.7, "belief_after": 0.3, "mode_used": "attack",
                "hidden": "SECRET_HISTORY", "provenance": {"step": "validation", "truth": "SECRET_PROV"},
            }, {"context_id": "exposure", "type": "brain_exposure", "outcome": "fail",
                "value": "SECRET_EXPOSURE"}],
                "contexts": [{"value": "SECRET_FUTURE"}], "hidden": "SECRET_SNAPSHOT"}

    store = SessionStore()
    session = store.create(Engine(), "x")
    app.dependency_overrides[get_repository] = MaliciousRepo
    app.dependency_overrides[get_session_store] = lambda: store
    observed = []

    def provider(_, payload):
        wire = json.dumps(payload)
        assert "SECRET" not in wire
        assert "exposure" not in wire
        rows = json.loads(payload["messages"][1]["content"])["sources"]
        observed.extend(rows)
        row = next(r for r in rows if r["title"] == "Committed experiment history")
        return {"message": {"content": json.dumps({"citation_ids": [row["id"]]})}}

    monkeypatch.setattr(lab, "ollama", provider)
    try:
        client = TestClient(app)
        body = client.post("/lab/chat", json={"candidate_id": "x", "session_id": session.session_id,
                                             "question": "What committed experiment outcome and value?"}).json()
        assert body["mode"] == "generated"
        assert "value: -0.03" in body["answer"].lower()
        assert "Extractive copilot" in body["answer"]
        assert "SECRET" not in json.dumps(body)
        assert observed
        # Reject before inspecting the mismatched engine snapshot.
        wrong = store.create(SimpleNamespace(state=lambda: (_ for _ in ()).throw(AssertionError())), "other")
        assert client.post("/lab/chat", json={"candidate_id": "x", "session_id": wrong.session_id,
                                              "question": "outcome"}).status_code == 409
        assert client.post("/lab/chat", json={"candidate_id": "x", "session_id": "missing",
                                              "question": "outcome"}).status_code == 404
    finally:
        app.dependency_overrides.clear()
