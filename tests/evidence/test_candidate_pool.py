import pandas as pd

from pipelines.evidence.candidate_pool import build_pool, map_compounds


def _drugs():
    return pd.DataFrame({
        "id": ["CHEMBL1", "CHEMBL2", "CHEMBL3", "CHEMBL4"],
        "name": ["A", "B-SALT", "B", "C"],
        "inchiKey": ["AAAAAAAAAAAAAA-XXXXXXXXXX-N", "BBBBBBBBBBBBBB-SALTSALTSA-N",
                     "BBBBBBBBBBBBBB-OTHERSTERE-N", "CCCCCCCCCCCCCC-XXXXXXXXXX-N"],
        "maximumClinicalStage": ["APPROVAL", "PHASE_1", "PHASE_3", "PRECLINICAL"],
        "drugType": ["Small molecule"] * 4, "parentId": [None] * 4,
    })


def test_full_key_then_connectivity_with_highest_stage():
    comp = pd.DataFrame({"pert_id": ["p1", "p2", "p3", "p4"],
                         "inchi_key": ["AAAAAAAAAAAAAA-XXXXXXXXXX-N", "BBBBBBBBBBBBBB-LINCSFORMS-N",
                                       "CCCCCCCCCCCCCC-XXXXXXXXXX-N", "-666"]})
    m = map_compounds(comp, _drugs()).set_index("pert_id")
    assert m.loc["p1", "match"] == "inchikey" and m.loc["p1", "chembl_id"] == "CHEMBL1"
    assert m.loc["p2", "match"] == "connectivity" and m.loc["p2", "max_clinical_stage"] == "PHASE_3"
    assert "p4" not in m.index


def test_pool_keeps_phase1_plus_in_rank_order_and_assigns_pools():
    n = 120
    ranking = pd.DataFrame({"rank": range(1, n + 1), "pert_id": [f"p{i}" for i in range(n)],
                            "pert_iname": [f"d{i}" for i in range(n)]})
    dm = pd.DataFrame({"pert_id": [f"p{i}" for i in range(n)],
                       "stage_num": [9 if i % 4 else 0 for i in range(n)]})
    pool = build_pool(ranking, dm)
    assert (pool["stage_num"] >= 3).all()
    assert list(pool["pool_rank"]) == list(range(1, len(pool) + 1))
    assert pool["rank"].is_monotonic_increasing
    assert (pool.loc[pool.pool_rank <= 50, "pool"] == "benchmark").all()
    assert (pool.loc[(pool.pool_rank > 50) & (pool.pool_rank <= 100), "pool"] == "development").all()
    assert sorted(pool.loc[pool.is_demo, "pool_rank"]) == [1, 5, 12]
