"""Response parsing, direction, pagination, matching and auditable offline replay."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pandas as pd
import pytest

from pipelines.resources.cache import Cache
from pipelines.resources.collect import agreement_rows, correlation, load_query
from pipelines.resources.perturbseqr import fetch, normalize_name, parse_page, rank_compounds, request

FIXTURE = Path(__file__).parent / "fixtures/paired_response.json"


def test_saved_real_response():
    payload = json.loads(FIXTURE.read_text())
    total, rows = parse_page(payload)
    assert total == 79
    # Gene perturbations in the original response must never enter drug ranks.
    assert {row["name"] for row in rows} == {"etoposide", "fentanyl"}
    ranked = rank_compounds(rows)
    assert ranked[0]["name"] == "etoposide"
    assert ranked[0]["score"] == pytest.approx(7.786696739033033e-6)
    assert ranked[0]["rank"] == 1


def test_direction_and_explicit_universe():
    q = request(["GFAP"], ["SST"], 10000, 10000)
    assert q["variables"]["genesUp"] == ["GFAP"]
    assert q["variables"]["genesDown"] == ["SST"]
    assert q["variables"]["offset"] == 10000
    assert "pvalueReverse" in q["query"]
    assert "pvalueLe:1, adjPvalueLe:1" in q["query"]
    assert "CREEDS Gene" not in q["variables"]["libraryNames"]


def test_graphql_and_invalid_scores():
    with pytest.raises(ValueError, match="GraphQL"):
        parse_page({"errors": [{"message": "broken"}]})
    payload = json.loads(FIXTURE.read_text())
    payload["data"]["currentBackground"]["pairedEnrich"]["nodes"][0]["pvalueReverse"] = -1
    with pytest.raises(ValueError, match="p-value"):
        parse_page(payload)


def test_names_ties_and_best_signature():
    assert normalize_name(" PIPERACILLIN-sodium ") == "piperacillin"
    assert normalize_name("Doxorubicin Hydrochloride") == "doxorubicin"
    assert normalize_name("cholic-acid") == normalize_name("CHOLIC ACID")
    assert normalize_name("alpha-estradiol") != normalize_name("beta-estradiol")
    ranked = rank_compounds([
        {"name": name, "score": score, "libraries": ["SciPlex"]}
        for name, score in [("a", .2), ("b", .1), ("a", .1), ("c", .3)]
    ])
    assert [(r["name"], r["rank"]) for r in ranked] == [("a", 1), ("b", 1), ("c", 3)]


def test_match_aliases_collisions_and_no_fuzzy_matches():
    pool = pd.DataFrame([
        {"pert_id": "A", "pert_iname": "test-drug", "drug_name": "ALIAS", "pool_rank": 1},
        {"pert_id": "B", "pert_iname": "other", "drug_name": "SHARED", "pool_rank": 2},
        {"pert_id": "C", "pert_iname": "third", "drug_name": "SHARED", "pool_rank": 3},
        {"pert_id": "D", "pert_iname": "missing", "drug_name": None, "pool_rank": 4},
    ])
    ranked = [{"name": n, "rank": i, "score": .01 * i, "libraries": ["SciPlex"]}
              for i, n in enumerate(["testdrug", "shared", "missinglonger"], 1)]
    rows = agreement_rows(pool, ranked, "perturb_seqr", "now", "url")
    assert [r["status"] for r in rows] == ["available", "not_available", "not_available", "not_found"]
    assert rows[0]["rank"] == 1
    assert rows[-1]["score"] is None
    assert all("not preregistered" in r["note"] for r in rows)
    ranked.append({"name": "alias", "rank": 4, "score": .04, "libraries": ["SciPlex"]})
    assert agreement_rows(pool, ranked, "perturb_seqr", "now", "url")[0]["rank"] == 1


def test_cache_offline_and_checksum(tmp_path, monkeypatch):
    content = FIXTURE.read_bytes()
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs)
        return httpx.Response(200, content=content)

    monkeypatch.setattr(httpx, "post", post)
    cache = Cache(tmp_path)
    assert cache.post("https://example.org/graphql", {"query": "q"}) == json.loads(content)
    assert len(calls) == 1
    offline = Cache(tmp_path, offline=True)
    assert offline.post("https://example.org/graphql", {"query": "q"}) == json.loads(content)
    assert len(calls) == 1
    path = Path(next(iter(offline.inputs)))
    path.write_bytes(b"tampered")
    with pytest.raises(ValueError, match="checksum"):
        offline.post("https://example.org/graphql", {"query": "q"})
    with pytest.raises(FileNotFoundError):
        offline.post("https://example.org/graphql", {"query": "other"})


def test_fetch_pages_and_reject_truncation():
    payload = json.loads(FIXTURE.read_text())
    first = payload["data"]["currentBackground"]["pairedEnrich"]["nodes"][0]
    offsets = []

    class Pages:
        def post(self, url, query):
            offset = query["variables"]["offset"]
            offsets.append(offset)
            return {"data": {"currentBackground": {"pairedEnrich": {
                "totalCount": 2, "nodes": [first] if offset < 2 else []}}}}

    assert len(fetch(["GFAP"], ["SST"], Pages(), page_size=1)) == 1
    assert offsets == [0, 1]

    class Truncated:
        def post(self, url, query):
            return {"data": {"currentBackground": {"pairedEnrich": {"totalCount": 1, "nodes": []}}}}

    with pytest.raises(ValueError, match="Truncated"):
        fetch(["GFAP"], ["SST"], Truncated())


def test_correlation_ignores_missing_and_requires_three():
    pool = pd.DataFrame({"pert_id": ["A", "B", "C", "D"], "consensus_median": [-3., -2., -1., 0.]})
    frame = pd.DataFrame({"pert_id": ["A", "B", "C", "D"], "resource": ["perturb_seqr"] * 4,
                          "status": ["available"] * 3 + ["not_found"], "score": [.1, .2, .3, None]})
    assert correlation(pool, frame, "perturb_seqr")["rho"] == pytest.approx(1.)
    assert correlation(pool, frame.head(2), "perturb_seqr")["rho"] is None


@pytest.mark.data
def test_real_query_direction_and_sets():
    from pipelines.common.paths import PROCESSED
    if not (PROCESSED / "signatures/GSE132903__main.parquet").exists():
        pytest.skip("real GSE132903 unavailable")
    query, inputs = load_query(PROCESSED)
    assert len(query["up"]) == len(query["down"]) == 150
    assert len(set(query["up"]) & set(query["down"])) == 0
    assert all(isinstance(e, str) for e in query["up_entrez"] + query["down_entrez"])
    assert len(inputs) == 4


def test_probability_rounding_tolerance():
    payload = json.loads(FIXTURE.read_text())
    node = payload["data"]["currentBackground"]["pairedEnrich"]["nodes"][0]
    node["pvalueReverse"] = 1.0000000001137275
    _, rows = parse_page(payload)
    assert rows[0]["score"] == 1.
    node["pvalueReverse"] = 1.00001
    with pytest.raises(ValueError, match="p-value"):
        parse_page(payload)
