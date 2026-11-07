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
