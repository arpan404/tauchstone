"""Brand names resolve through ChEMBL-source labels first; AACT labels only fill gaps."""

import pandas as pd
import pytest

from pipelines.evidence import lookup as lk


def C(label):  # noqa: N802 - mirrors the OT {label, source} entries
    return {"label": label, "source": "ChEMBL"}


def A(label):  # noqa: N802
    return {"label": label, "source": "AACT"}


COMPOUNDS = pd.DataFrame({
    "pert_id": ["P_DONE", "P_RIVA", "P_GAL", "P_MEM_RANKED", "P_MEM_OTHER"],
    "pert_iname": ["donepezil", "rivastigmine", "galantamine", "memantine", "memantine"],
})
# Two LINCS ids share memantine's ChEMBL id; the unranked one comes last (used to win).
DRUG_MAP = pd.DataFrame({
    "pert_id": ["P_DONE", "P_RIVA", "P_GAL", "P_MEM_RANKED", "P_MEM_OTHER"],
    "drug_name": ["DONEPEZIL", "RIVASTIGMINE", "GALANTAMINE", "MEMANTINE", "MEMANTINE"],
    "chembl_id": ["CHEMBL502", "CHEMBL636", "CHEMBL659", "CHEMBL807", "CHEMBL807"],
    "parent_chembl_id": [None] * 5,
})
# Shaped like the real OT drug_molecule rows, including the AACT errors.
OT = pd.DataFrame({
    "id": ["CHEMBL502", "CHEMBL1678", "CHEMBL636", "CHEMBL1201092", "CHEMBL659", "CHEMBL1555",
           "CHEMBL807", "CHEMBL1699", "CHEMBL999"],
    "name": ["DONEPEZIL", "DONEPEZIL HYDROCHLORIDE", "RIVASTIGMINE", "RIVASTIGMINE TARTRATE",
             "GALANTAMINE", "GALANTAMINE HYDROBROMIDE", "MEMANTINE", "MEMANTINE HYDROCHLORIDE",
             "NOTLINCSMAB"],
    "parentId": [None, "CHEMBL502", None, "CHEMBL636", None, "CHEMBL659", None, "CHEMBL807", None],
    "synonyms": [
        [C("E-2020"), A("achei")],
        [C("Donepezil hcl"), A("exelon")],
        [C("ENA-713"), A("aricept"), A("donepezil"), A("exelon patch")],
        [C("Rivastigmine tartrate"), A("aricept")],
        [C("Galanthamine"), A("donepezil"), A("gal")],
        [C("Nivalin")],
        [C("D-145")],
        [C("Memantine hcl")],
        [C("Brandless")],
    ],
    "tradeNames": [
        [], [C("Aricept"), C("Aricept odt")], [C("Exelon")], [C("Exelon"), C("Prometax")],
        [C("Reminyl")], [C("Razadyne"), C("Razadyne er")], [], [C("Namenda"), C("Ebixa")], [],
    ],
})
RANKED = {"P_DONE", "P_GAL", "P_MEM_RANKED"}


def _frames():
    ranking = pd.DataFrame({"pert_id": sorted(RANKED), "consensus_median": [-0.24, -0.1, -0.36],
                            "n_ranking_contexts": [6, 4, 4]})
    pool = pd.DataFrame({"pert_id": ["P_DONE", "P_GAL", "P_MEM_RANKED"],
                         "drug_name": ["DONEPEZIL", "GALANTAMINE", "MEMANTINE"],
                         "pool_rank": [684, 1214, 502]})
    truth = pd.DataFrame({"candidate_id": []})
    return ranking, pool, truth


def _lookup(names):
    ranking, pool, truth = _frames()
    index = lk.build_index(COMPOUNDS, DRUG_MAP, OT, RANKED)
    known = lk.known_names(OT) | set(index)
    return {r["query"]: r for r in lk.lookup(names, ranking, pool, COMPOUNDS, DRUG_MAP, truth,
                                              index, known)}


def test_index_prefers_chembl_labels_over_aact():
    index = lk.build_index(COMPOUNDS, DRUG_MAP, OT, RANKED)
    assert index["aricept"] == "P_DONE"        # AACT lists it under rivastigmine twice
    assert index["exelon"] == "P_RIVA"         # AACT lists it under donepezil
    assert index["razadyne"] == "P_GAL"        # salt record -> parent galantamine
    assert index["namenda"] == "P_MEM_RANKED"  # ranked LINCS id wins a shared ChEMBL id
    assert index["donepezil"] == "P_DONE"      # real names always win
    assert index["achei"] == "P_DONE"          # unique AACT label fills a gap
    assert "gal" in index and index["gal"] == "P_GAL"


@pytest.mark.parametrize(("brand", "status", "name", "rank"), [
    ("Aricept", "ranked", "Donepezil", 684),
    ("Razadyne", "ranked", "Galantamine", 1214),
    ("Exelon", "not_rankable", "Rivastigmine", None),
    ("Namenda", "ranked", "Memantine", 502),
])
def test_brand_names_resolve(brand, status, name, rank):
    row = _lookup([brand])[brand]
    assert (row["status"], row["name"], row["pool_rank"]) == (status, name, rank)


def test_unrecognized_vs_not_in_lincs():
    rows = _lookup(["Brandless", "NOTLINCSMAB", "zzz-not-a-drug"])
    assert rows["Brandless"]["status"] == "not_in_lincs"     # known compound, no LINCS id
    assert rows["NOTLINCSMAB"]["status"] == "not_in_lincs"
    assert rows["zzz-not-a-drug"]["status"] == "unrecognized"
    assert rows["zzz-not-a-drug"]["drug_id"] is None


def test_prebuilt_index_without_known_keeps_not_in_lincs():
    ranking, pool, truth = _frames()
    index = lk.build_index(COMPOUNDS, DRUG_MAP, OT, RANKED)
    row = lk.lookup(["zzz"], ranking, pool, COMPOUNDS, DRUG_MAP, truth, index)[0]
    assert row["status"] == "not_in_lincs"


def test_brands_resolve_from_offline_bundle(tmp_path, monkeypatch):
    """Offline demo bundle: OT synonyms come from processed/evidence/ot_drug_molecule.parquet."""
    slim = tmp_path / "ot_drug_molecule.parquet"
    OT.to_parquet(slim)
    monkeypatch.setattr(lk, "OT_DIR", tmp_path / "missing")
    monkeypatch.setattr(lk, "OT_SLIM_PATH", slim)
    lk._INDEX_CACHE.clear()
    ranking, pool, truth = _frames()
    rows = {r["query"]: r for r in lk.lookup(["Aricept", "Razadyne", "Exelon", "Namenda", "qqq"],
                                              ranking, pool, COMPOUNDS, DRUG_MAP, truth)}
    assert rows["Aricept"]["name"] == "Donepezil"
    assert rows["Razadyne"]["name"] == "Galantamine"
    assert rows["Exelon"]["status"] == "not_rankable"
    assert rows["Namenda"]["pool_rank"] == 502
    assert rows["qqq"]["status"] == "unrecognized"
    lk._INDEX_CACHE.clear()


@pytest.mark.data
def test_real_brand_names():
    lk._INDEX_CACHE.clear()
    try:
        rows = {r["query"]: r for r in lk.lookup(["Aricept", "Razadyne", "Exelon", "Namenda",
                                                  "lithium", "zzz-not-a-drug"])}
    except FileNotFoundError as e:
        pytest.skip(f"real data absent: {e}")
    if lk.load_ot_molecule() is None:
        pytest.skip("OT drug_molecule absent")
    assert (rows["Aricept"]["name"], rows["Aricept"]["pool_rank"]) == ("Donepezil", 684)
    assert (rows["Razadyne"]["name"], rows["Razadyne"]["pool_rank"]) == ("Galantamine", 1214)
    assert (rows["Exelon"]["name"], rows["Exelon"]["status"]) == ("Rivastigmine", "not_rankable")
    assert (rows["Namenda"]["name"], rows["Namenda"]["pool_rank"]) == ("Memantine", 502)
    assert rows["lithium"]["status"] == "not_in_lincs"
    assert rows["zzz-not-a-drug"]["status"] == "unrecognized"
