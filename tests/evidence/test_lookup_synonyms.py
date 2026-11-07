import pandas as pd

from pipelines.evidence.lookup import build_index


def test_ambiguous_synonym_never_overrides_or_misroutes():
    compounds = pd.DataFrame({"pert_id": ["P_RIVA", "P_DONE"], "pert_iname": ["rivastigmine", "donepezil"]})
    drug_map = pd.DataFrame({"pert_id": ["P_RIVA"], "drug_name": ["RIVASTIGMINE"], "chembl_id": ["C_RIVA"],
                             "parent_chembl_id": [None]})
    ot = pd.DataFrame({
        "id": ["C_RIVA", "C_DONE"], "name": ["RIVASTIGMINE", "DONEPEZIL"], "parentId": [None, None],
        "synonyms": [["Aricept", "Exelon"], []], "tradeNames": [[], ["Aricept"]],
    })
    index = build_index(compounds, drug_map, ot, ranked_ids={"P_RIVA", "P_DONE"})
    assert "aricept" not in index          # claimed by two drugs -> dropped, never misrouted
    assert index["exelon"] == "P_RIVA"     # unambiguous synonym fills the gap
    assert index["donepezil"] == "P_DONE"  # real names always win


def test_ot_molecule_falls_back_to_bundled_copy(tmp_path, monkeypatch):
    """Offline bundle has no raw/ tree; synonyms come from processed/evidence."""
    import pandas as pd

    from pipelines.evidence import lookup as lk

    slim = tmp_path / "ot_drug_molecule.parquet"
    pd.DataFrame({"id": ["CHEMBL502"], "name": ["DONEPEZIL"], "synonyms": [["E-2020"]],
                  "tradeNames": [["Aricept"]], "parentId": [None]}).to_parquet(slim)
    monkeypatch.setattr(lk, "OT_DIR", tmp_path / "missing")
    monkeypatch.setattr(lk, "OT_SLIM_PATH", slim)
    frame = lk.load_ot_molecule()
    assert frame is not None and frame["name"].tolist() == ["DONEPEZIL"]
    monkeypatch.setattr(lk, "OT_SLIM_PATH", tmp_path / "absent.parquet")
    assert lk.load_ot_molecule() is None
