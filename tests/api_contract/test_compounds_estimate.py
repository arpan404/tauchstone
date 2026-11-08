"""POST /compounds/estimate: exploratory structure-only estimate, display only.

Offline tests build a tiny model in a temp dir so all three bases and the 409 paths run
without real data. Real-artifact tests are marked `data`.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import joblib
import numpy as np
import pandas as pd
import pytest
from app.main import app
from app.routes import compounds_estimate as route
from app.routes import lab
from fastapi.testclient import TestClient
from rdkit import Chem
from rdkit.Chem import rdFingerprintGenerator
from sklearn.ensemble import RandomForestRegressor

from pipelines.common.provenance import Provenance
from tests.api_contract.openapi_check import check

client = TestClient(app)

TRAIN = {"BRD-T1": "CCO", "BRD-T2": "c1ccccc1O", "BRD-T3": "CC(=O)Nc1ccc(O)cc1", "BRD-T4": "CCN(CC)CC"}
TEST = {"BRD-H1": "c1ccc2ccccc2c1", "BRD-H2": "CC(C)Cc1ccc(C(C)C(=O)O)cc1"}
EXTRA = {
    "BRD-N1": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",  # caffeine: new to the model
    "BRD-D1": "OCC",  # same structure as BRD-T1 under another id
    "BRD-X1": "not a smiles",
    "BRD-E1": None,  # in LINCS, no structure
}


def post(ids):
    response = client.post("/compounds/estimate", json={"ids": ids})
    return response


def build(tmp_path):
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    rows = [(p, s, "train") for p, s in TRAIN.items()] + [(p, s, "internal_test_scaffold") for p, s in TEST.items()]
    x = np.vstack([gen.GetFingerprintAsNumPy(Chem.MolFromSmiles(s)) for _, s, _ in rows])
    y = np.linspace(-1, 1, len(rows))
    train = [i for i, r in enumerate(rows) if r[2] == "train"]
    model = RandomForestRegressor(n_estimators=10, random_state=0).fit(x[train], y[train])
    out = tmp_path / route.OUTPUT
    out.mkdir(parents=True)
    pd.DataFrame({
        "pert_id": [r[0] for r in rows], "pert_iname": [r[0] for r in rows],
        "canonical_structure": [Chem.MolToSmiles(Chem.MolFromSmiles(r[1])) for r in rows],
        "group": [r[0] for r in rows], "consensus_median": y, "split": [r[2] for r in rows],
        "predicted": model.predict(x),
    }).to_parquet(out / "predictions.parquet", index=False)
    joblib.dump(model, out / "model.joblib")
    prov = Provenance(step=route.STEP, dataset_accession="GSE132903", random_seed=0)
    (out / "report.json").write_text(json.dumps({"run_id": "run-test", "provenance": {"timestamp": prov.timestamp}}))
    for name in route.ARTIFACTS:
        prov.write(out / name)
    lincs = tmp_path / "processed/lincs"
    lincs.mkdir(parents=True)
    every = TRAIN | TEST | EXTRA
    pd.DataFrame({"pert_id": list(every), "canonical_smiles": list(every.values())}).to_parquet(
        lincs / "compounds.parquet", index=False)
    return model, y


@pytest.fixture
def real_mode(monkeypatch, tmp_path):
    monkeypatch.setattr(route, "settings", SimpleNamespace(mock=False, data_dir=tmp_path))
    monkeypatch.setattr(lab.training, "state", {"status": "ready"})
    return tmp_path


def test_mock_mode_serves_fixture_offline(monkeypatch):
    monkeypatch.setattr(route, "settings", SimpleNamespace(mock=True))
    r = post(["BRD-A49160188", "BRD-A49148672", "BRD-K10706131", "nope"])
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        check(row, "CompoundEstimate")
    assert [row["basis"] for row in rows] == ["in_training", "held_out", "new_structure", None]
    assert rows[2]["measured"] is None
    assert rows[3]["estimate"] is None and rows[3]["status"] == "unknown_id"
    assert all(row["run_id"].startswith("MOCK") for row in rows)


def test_request_limits(monkeypatch):
    monkeypatch.setattr(route, "settings", SimpleNamespace(mock=True))
    assert post(["BRD-1"] * 51).status_code == 422
    assert client.post("/compounds/estimate", json={"ids": [], "extra": 1}).status_code == 422
    assert post([]).json() == []


def test_three_bases_and_missing_structures(real_mode):
    model, y = build(real_mode)
    r = post(["BRD-T2", "BRD-H1", "BRD-N1", "BRD-D1", "BRD-X1", "BRD-E1", "lithium"])
    assert r.status_code == 200
    rows = {row["id"]: row for row in r.json()}
    for row in rows.values():
        check(row, "CompoundEstimate")
        assert row["run_id"] == "run-test"

    assert rows["BRD-T2"] | {"estimate": None} == {
        "id": "BRD-T2", "estimate": None, "basis": "in_training", "measured": pytest.approx(y[1]),
        "status": "stored", "run_id": "run-test"}
    assert rows["BRD-H1"]["basis"] == "held_out" and rows["BRD-H1"]["measured"] == pytest.approx(y[4])

    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    caffeine = gen.GetFingerprintAsNumPy(Chem.MolFromSmiles(EXTRA["BRD-N1"])).reshape(1, -1)
    assert rows["BRD-N1"]["basis"] == "new_structure"
    assert rows["BRD-N1"]["estimate"] == pytest.approx(model.predict(caffeine)[0])
    assert rows["BRD-N1"]["measured"] is None and rows["BRD-N1"]["status"] == "computed"
    # Identical structure under another id is not new to the model.
    assert rows["BRD-D1"]["basis"] == "in_training" and rows["BRD-D1"]["measured"] is None

    for pid, status in (("BRD-X1", "invalid_structure"), ("BRD-E1", "no_structure"), ("lithium", "unknown_id")):
        assert rows[pid]["estimate"] is None and rows[pid]["basis"] is None and rows[pid]["status"] == status


def test_409_when_not_trained(real_mode):
    r = post(["BRD-T1"])
    assert r.status_code == 409


def test_409_while_training(real_mode, monkeypatch):
    build(real_mode)
    monkeypatch.setattr(lab.training, "state", {"status": "training"})
    assert post(["BRD-T1"]).status_code == 409


def test_409_on_checksum_mismatch_before_loading(real_mode, monkeypatch):
    build(real_mode)
    model = real_mode / route.OUTPUT / "model.joblib"
    model.write_bytes(model.read_bytes() + b"tampered")
    monkeypatch.setattr(joblib, "load", lambda *_: pytest.fail("pickle loaded before checksum check"))
    assert post(["BRD-N1"]).status_code == 409


# ---------------------------------------------------------------- real artifacts


@pytest.fixture
def real_data(monkeypatch):
    from pipelines.common.paths import DATA_DIR
    if not (DATA_DIR / route.OUTPUT / "model.joblib").exists():
        pytest.skip("exploratory model not trained in TS_DATA_DIR")
    monkeypatch.setattr(route, "settings", SimpleNamespace(mock=False, data_dir=DATA_DIR))
    monkeypatch.setattr(lab.training, "state", {"status": "ready"})
    return DATA_DIR


@pytest.mark.data
def test_real_three_bases(real_data):
    report = json.loads((real_data / route.OUTPUT / "report.json").read_text())
    # donepezil (train), galantamine (scaffold test), rivastigmine (not rankable, has SMILES),
    # memantine's second pert_id (same structure as training memantine), merck-ketone (no SMILES).
    ids = ["BRD-A49160188", "BRD-A49148672", "BRD-K10706131", "BRD-K91938660", "BRD-A94377914"]
    rows = post(ids).json()
    for row in rows:
        check(row, "CompoundEstimate")
        assert row["run_id"] == report["run_id"]
    assert [r["basis"] for r in rows] == ["in_training", "held_out", "new_structure", "in_training", None]
    assert rows[0]["measured"] == pytest.approx(-0.2444, abs=1e-3)
    assert rows[1]["measured"] == pytest.approx(0.2070, abs=1e-3)
    assert rows[2]["measured"] is None and rows[2]["estimate"] is not None
    assert rows[3]["measured"] is None and rows[3]["status"] == "computed"
    assert rows[4]["status"] == "no_structure" and rows[4]["estimate"] is None


@pytest.mark.data
def test_real_stored_values_match_predictions(real_data):
    preds = pd.read_parquet(real_data / route.OUTPUT / "predictions.parquet").set_index("pert_id")
    sample = preds.sample(20, random_state=1)
    rows = post(list(sample.index)).json()
    for row in rows:
        stored = sample.loc[row["id"]]
        assert row["estimate"] == pytest.approx(stored.predicted)
        assert row["measured"] == pytest.approx(stored.consensus_median)
        assert row["basis"] == ("held_out" if stored.split == "internal_test_scaffold" else "in_training")
