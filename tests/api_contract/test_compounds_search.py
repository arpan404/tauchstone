"""Contract tests for GET /compounds/search (My compounds picker).

Mock mode serves contracts/fixtures/searchCompounds.json through the same matcher;
data-marked tests run the real index over $TS_DATA_DIR/processed.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from app.deps import get_repository
from app.main import app
from app.services import compound_search as cs
from app.services import drug_detail as dd
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.api_contract.openapi_check import check

DATA = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"
NEED = [
    "lincs/compounds.parquet",
    "evidence/drug_map.parquet",
    "scores/GSE132903__main__compound_ranking.parquet",
    "scores/GSE132903__main__candidate_pool.parquet",
]


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _search(client, q, **params):
    r = client.get("/compounds/search", params={"q": q, **params})
    assert r.status_code == 200, r.text
    rows = r.json()
    for row in rows:
        check(row, "CompoundMatch")
    return rows


def test_mock_search_prefix_alias_and_order(client):
    rows = _search(client, "done")
    assert rows[0]["name"] == "Donepezil"
    assert rows[0]["pool_rank"] == 684 and rows[0]["rank_total"] == 1816
    # Prefix before substring: Donepezil and Donetidine first, then the -done drugs.
    assert [r["name"] for r in rows[:2]] == ["Donepezil", "Donetidine"]
    assert rows[1]["status"] == "not_in_lincs"
    assert "Iloperidone" in [r["name"] for r in rows[2:]]
    brand = _search(client, "Aricept")
    assert brand[0]["id"] == "BRD-A49160188"
    assert brand[0]["matched_alias"] == "Aricept"


def test_mock_search_normalises_and_ranks_before_unranked(client):
    rows = _search(client, "LITHIUM")
    assert rows[0] == {"id": "CHEMBL1201333", "name": "Lithium", "status": "not_in_lincs"}
    assert _search(client, "lithium chloride")[0]["status"] == "not_rankable"
    rows = _search(client, "ine")
    statuses = [r["status"] for r in rows]
    assert statuses == sorted(statuses, key=["ranked", "not_rankable", "not_in_lincs"].index)
    ranks = [r["pool_rank"] for r in rows if r["status"] == "ranked"]
    assert ranks == sorted(ranks)


def test_mock_search_limits_and_empty(client):
    assert _search(client, "") == []
    assert _search(client, "  -- ") == []
    assert _search(client, "zzqx") == []
    assert len(_search(client, "i", limit=2)) == 2
    assert "matched_alias" not in _search(client, "nepafenac")[0]
    for bad in (0, 51):
        assert client.get("/compounds/search", params={"q": "a", "limit": bad}).status_code == 422


def test_short_queries_skip_substring():
    index = cs.index_from_fixture([{"id": "X", "name": "Abcdef", "status": "not_rankable"}])
    assert cs.search(index, "bc") == []
    assert cs.search(index, "bcd")[0]["id"] == "X"
    assert cs.search(index, "ab")[0]["id"] == "X"


# ----------------------------------------------------------------------------
# Real data
# ----------------------------------------------------------------------------


@pytest.fixture(scope="module")
def real_client():
    missing = [f for f in NEED if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    repo = ParquetRepository(DATA)
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.data
def test_real_search_typed_examples(real_client):
    done = _search(real_client, "done")
    assert done[0]["name"] == "Donepezil" and done[0]["pool_rank"] == 684
    assert done[0]["consensus"] == pytest.approx(-0.24, abs=0.01)
    aric = _search(real_client, "aric")
    assert aric[0]["name"] == "Donepezil" and aric[0]["matched_alias"] == "Aricept"
    vor = _search(real_client, "vorinost")
    assert vor[0]["name"] == "Vorinostat" and vor[0]["status"] == "ranked"
    assert _search(real_client, "rivastigmine")[0]["status"] == "not_rankable"
    assert _search(real_client, "lithium")[0]["status"] == "not_in_lincs"
    assert len(_search(real_client, "a", limit=50)) == 50


@pytest.mark.data
def test_real_index_covers_lincs_and_agrees_with_lookup():
    missing = [f for f in NEED if not (DATA / f).exists()]
    if missing:
        pytest.skip(f"real data absent: {missing[0]}")
    index = cs.index_for(DATA)
    ids = {r.id for r in index.rows}
    # Far beyond the 1,816-drug clinical pool: every reachable LINCS name plus ChEMBL-only drugs.
    assert sum(r.status != "not_in_lincs" for r in index.rows) > 20_000
    assert any(r.status == "not_in_lincs" for r in index.rows)
    assert "BRD-A49160188" in ids
    # Every row's name checks to the same compound through POST /lookup.
    results = dd.lookup_compounds(DATA, [r.name for r in index.rows])
    for row, hit in zip(index.rows, results, strict=True):
        assert hit["status"] == row.status, (row, hit)
        if row.status != "not_in_lincs":
            assert hit["drug_id"] == row.id, (row, hit)
        assert hit.get("pool_rank") == row.pool_rank, (row, hit)
        if row.consensus is not None:
            assert hit["consensus"] == pytest.approx(row.consensus)
