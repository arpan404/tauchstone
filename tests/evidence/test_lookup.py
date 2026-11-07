import pandas as pd
import pytest

from pipelines.evidence.lookup import build_index, lookup, normalize


def _frames():
    ranking = pd.DataFrame(
        [
            {"pert_id": "BRD-R1", "consensus_median": -1.0, "n_ranking_contexts": 3},
            {"pert_id": "BRD-R2", "consensus_median": 0.2, "n_ranking_contexts": 5},
        ]
    )
    pool = pd.DataFrame(
        [
            {"pert_id": "BRD-R1", "pool_rank": 2, "drug_name": "NEP-like"},
            {"pert_id": "BRD-R2", "pool_rank": 10, "drug_name": "OTHER-drug"},
        ]
    )
    compounds = pd.DataFrame(
        [
            {"pert_id": "BRD-R1", "pert_iname": "nep-like"},
            {"pert_id": "BRD-R2", "pert_iname": "other-drug"},
            {"pert_id": "BRD-U1", "pert_iname": "thin-drug"},
        ]
    )
    drug_map = pd.DataFrame(
        [
            {"pert_id": "BRD-R1", "chembl_id": "CHEMBL1", "drug_name": "NEP-LIKE",
             "parent_chembl_id": None},
        ]
    )
    truth = pd.DataFrame([{"candidate_id": "BRD-R1"}])
    ot = pd.DataFrame(
        [{"id": "CHEMBL1", "name": "NEP-LIKE", "synonyms": [{"label": "Neppy"}],
          "tradeNames": [{"label": "NeppyBrand"}]}]
    )
    return ranking, pool, compounds, drug_map, truth, ot


def test_normalize():
    assert normalize("Donepezil") == "donepezil"
    assert normalize("CHOLIC-ACID") == "cholicacid"
    assert normalize("cholic acid") == "cholicacid"
    assert normalize("  E-2020 ") == "e2020"
    assert normalize(None) == ""
    assert normalize(123) == ""


def test_build_index_ranked_wins_collision():
    ranking, pool, compounds, drug_map, truth, ot = _frames()
    dup = pd.concat(
        [compounds, pd.DataFrame([{"pert_id": "BRD-U2", "pert_iname": "NEP-LIKE"}])],
        ignore_index=True,
    )
    index = build_index(dup, drug_map, ot, ranked_ids={"BRD-R1", "BRD-R2"})
    assert index[normalize("nep-like")] == "BRD-R1"
    assert index[normalize("neppy")] == "BRD-R1"  # OT synonym of the mapped ChEMBL id
    assert index[normalize("thin-drug")] == "BRD-U1"


def test_lookup_statuses_and_order():
    ranking, pool, compounds, drug_map, truth, ot = _frames()
    index = build_index(compounds, drug_map, ot, ranked_ids={"BRD-R1", "BRD-R2"})
    rows = lookup(["Thin-Drug", "NEP-LIKE", "missing-thing", "other drug"],
                  ranking, pool, compounds, drug_map, truth, index)
    assert [r["query"] for r in rows] == ["Thin-Drug", "NEP-LIKE", "missing-thing", "other drug"]
    thin, nep, missing, other = rows
    assert thin["status"] == "not_rankable" and thin["drug_id"] == "BRD-U1"
    assert thin["pool_rank"] is None and thin["rank_total"] is None
    assert nep["status"] == "ranked" and nep["pool_rank"] == 2 and nep["rank_total"] == 2
    assert nep["consensus"] == pytest.approx(-1.0) and nep["n_contexts"] == 3
    assert nep["attack_ready"] and nep["preregistered"]
    assert missing["status"] == "not_in_lincs" and missing["drug_id"] is None
    assert other["status"] == "ranked" and not other["attack_ready"]
