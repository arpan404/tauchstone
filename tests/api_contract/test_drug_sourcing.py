"""Purity and sourcing check on GET /drugs/{id} (Broad Repurposing Hub sample QC, 2020).

Display only: the field must not change anything else in the drug payload.
"""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import pytest
from app.deps import get_repository
from app.main import app
from app.services import drug_detail
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check

DATA = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"
PIPERACILLIN = "BRD-K86873305"
TICRYNAFEN = "BRD-K34098590"


def test_mock_drug_detail_has_sourcing():
    body = TestClient(app).get(f"/drugs/{PIPERACILLIN}").json()
    check(body, "DrugDetail")
    s = body["sourcing"]
    check(s, "Sourcing")
    assert s["status"] == "at_or_above_95" and s["best_purity_pct"] == 96.3
    assert s["vendors"] == ["MedChemEx", "Selleck", "Sigma"]
    assert s["source"] == "Broad Drug Repurposing Hub sample QC (2020)"


def _table(tmp_path: Path, rows: list[dict]) -> Path:
    (tmp_path / "evidence").mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_parquet(tmp_path / "evidence" / "sourcing.parquet", index=False)
    return tmp_path


def test_sourcing_for_reads_table_and_defaults(tmp_path):
    assert drug_detail.sourcing_for(tmp_path, "X") is None  # table not built: field omitted
    base = _table(tmp_path, [
        {"pert_id": "A", "status": "below_95", "best_purity_pct": 89.78, "n_samples": 2,
         "n_samples_at_or_above_95": 0, "vendors": "Selleck; Tocris", "n_vendors": 2,
         "best_vendor": "Tocris", "best_catalog_no": None, "qc_incompatible": True,
         "n_qc_incompatible": 1, "match": "inchikey_block"},
        {"pert_id": "B", "status": "no_purity_value", "best_purity_pct": None, "n_samples": 1,
         "n_samples_at_or_above_95": 0, "vendors": None, "n_vendors": 0, "best_vendor": None,
         "best_catalog_no": None, "qc_incompatible": False, "n_qc_incompatible": 0,
         "match": "name"},
    ])
    a = drug_detail.sourcing_for(base, "A")
    assert a["vendors"] == ["Selleck", "Tocris"] and a["best_catalog_no"] is None
    assert a["qc_incompatible"] and a["match"] == "inchikey_block"
    b = drug_detail.sourcing_for(base, "B")
    assert b["best_purity_pct"] is None and b["vendors"] == []
    missing = drug_detail.sourcing_for(base, "NOT-THERE")
    assert missing["status"] == "no_record" and missing["match"] == "none"
    from app.present import public
    for payload in (a, b, missing):
        check(public(payload), "Sourcing")


@pytest.mark.data
def test_real_ticrynafen_sourcing_and_display_only():
    need = ["evidence/sourcing.parquet", "scores/GSE132903__main__compound_ranking.parquet",
            "evidence/gaps.parquet"]
    missing = [f for f in need if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    repo = ParquetRepository(DATA)
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        body = TestClient(app).get(f"/drugs/{TICRYNAFEN}").json()
    finally:
        app.dependency_overrides.pop(get_repository, None)
    check(body, "DrugDetail")
    s = body["sourcing"]
    assert s["status"] == "at_or_above_95" and s["best_purity_pct"] == pytest.approx(99.37)
    assert s["vendors"] == ["Sigma"] and s["match"] == "inchikey"


    # Display only: without the sourcing table every other field is identical.
    def detail(monkeypatch_off: bool) -> dict:
        orig = drug_detail.sourcing_for
        if monkeypatch_off:
            drug_detail.sourcing_for = lambda base, drug_id: None
        try:
            return repo.get_drug_detail(TICRYNAFEN)
        finally:
            drug_detail.sourcing_for = orig

    on, off = detail(False), detail(True)
    assert off["sourcing"] is None and on["sourcing"]["status"] == "at_or_above_95"
    assert {k: v for k, v in on.items() if k != "sourcing"} == {
        k: v for k, v in off.items() if k != "sourcing"}
