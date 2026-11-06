import pandas as pd

from pipelines.evidence.approval import build_approval, map_stage
from pipelines.evidence.targets import build_targets, explode_mechanism, prefer_swissprot


def _drug_map():
    return pd.DataFrame({
        "pert_id": ["p1", "p2", "p3"],
        "chembl_id": ["CHEMBL1", "CHEMBL2", "CHEMBL3"],
        "parent_chembl_id": [None, "CHEMBLP", "CHEMBL3"],
        "max_clinical_stage": ["APPROVAL", "PHASE_2", "PRECLINICAL"],
    })


def test_map_stage():
    assert map_stage("APPROVAL") == ("approved", 4.0)
    assert map_stage("PHASE_3") == ("investigational", 3.0)
    assert map_stage("PHASE_2_3") == ("investigational", 2.5)
    assert map_stage("PHASE_2") == ("investigational", 2.0)
    assert map_stage("PHASE_1_2") == ("investigational", 1.5)
    assert map_stage("PHASE_1") == ("investigational", 1.0)
    assert map_stage("PREAPPROVAL") == ("investigational", None)
    assert map_stage("EARLY_PHASE_1") == ("preclinical", 0.5)
    assert map_stage("IND") == ("preclinical", None)
    assert map_stage("PRECLINICAL") == ("preclinical", None)
    assert map_stage("WITHDRAWN") == ("unknown", None)
    assert map_stage(None) == ("unknown", None)


def test_build_approval_urls():
    out = build_approval(_drug_map())
    assert out.set_index("pert_id").loc["p1", "status"] == "approved"
    url = out.set_index("pert_id").loc["p1", "source_url"]
    assert url == "https://www.ebi.ac.uk/chembl/compound_report_card/CHEMBL1/"


def test_explode_mechanism_cartesian():
    moa = pd.DataFrame([{"chemblIds": ["C1", "C2"], "targets": ["E1", "E2"],
                         "actionType": "INHIBITOR", "mechanismOfAction": "X inhibitor",
                         "targetName": "X"}])
    long = explode_mechanism(moa)
    assert len(long) == 4
    assert set(long["moa_chembl_id"]) == {"C1", "C2"}
    assert set(long["ensembl_id"]) == {"E1", "E2"}


def test_parent_fallback_and_dedup():
    moa_long = pd.DataFrame([
        {"moa_chembl_id": "CHEMBL2", "ensembl_id": "E9", "action_type": "AGONIST",
         "mechanism": "own mech", "target_name": "T9"},
        {"moa_chembl_id": "CHEMBLP", "ensembl_id": "E1", "action_type": "INHIBITOR",
         "mechanism": "parent mech", "target_name": "T1"},
    ])
    target_index = pd.DataFrame([
        {"id": "E1", "approvedSymbol": "T1", "uniprot": "P00001"},
        {"id": "E9", "approvedSymbol": "T9", "uniprot": "P00009"},
    ])
    uniprot = pd.DataFrame([
        {"uniprot": "P00001", "uniprot_gene": "T1", "entrez_id": "111"},
        {"uniprot": "P00009", "uniprot_gene": "T9", "entrez_id": "999"},
    ])
    out = build_targets(_drug_map(), moa_long, target_index, uniprot)
    p2 = out[out["pert_id"] == "p2"]
    assert set(p2["ensembl_id"]) == {"E9", "E1"}  # own + parent mechanisms
    assert p2[p2["ensembl_id"] == "E1"].iloc[0]["entrez_id"] == "111"
    assert p2.iloc[0]["source_url"].endswith("/CHEMBL2/")
    assert "p1" not in set(out["pert_id"])  # no mechanism rows -> absent


def test_prefer_swissprot():
    ids = [{"id": "A0A000", "source": "uniprot_trembl"},
           {"id": "P12345", "source": "uniprot_swissprot"}]
    assert prefer_swissprot(ids) == "P12345"
    assert prefer_swissprot([{"id": "A0A000", "source": "uniprot_trembl"}]) == "A0A000"
    assert prefer_swissprot(None) is None
    assert prefer_swissprot([]) is None
