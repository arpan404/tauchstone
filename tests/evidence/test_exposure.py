import pandas as pd
import pytest

from pipelines.evidence.exposure import (
    PE_SURVIVE,
    classify_activity,
    kp_from_row,
    logbb_to_kp,
    normalise_pe_to_cm_s,
    predict_cns_penetrant,
    survives,
)


def test_logbb_to_kp():
    assert logbb_to_kp(0.0) == pytest.approx(1.0)
    assert logbb_to_kp(-1.0) == pytest.approx(0.1)
    assert logbb_to_kp(None) is None


def test_pe_units():
    assert normalise_pe_to_cm_s(5.0, "10^-6 cm/s") == pytest.approx(5e-6)
    assert normalise_pe_to_cm_s(5.0, "10'-6 cm/s") == pytest.approx(5e-6)
    assert normalise_pe_to_cm_s(400.0, "nm/s") == pytest.approx(4e-5)
    assert normalise_pe_to_cm_s(400.0, "nm s-1") == pytest.approx(4e-5)
    assert normalise_pe_to_cm_s(2.5, "ucm/s") == pytest.approx(2.5e-4)
    assert normalise_pe_to_cm_s(1.0, "cm/s") == pytest.approx(1.0)
    assert normalise_pe_to_cm_s(1.0, "furlongs/fortnight") is None
    assert normalise_pe_to_cm_s(1.0, None) is None


def test_survive_boundaries():
    assert survives("measured_preclinical", "kp", 0.1) is True
    assert survives("measured_preclinical", "kp", 0.099) is False
    assert survives("measured_preclinical", "pampa_pe", PE_SURVIVE) is True
    assert survives("measured_preclinical", "pampa_pe", PE_SURVIVE * 0.99) is False
    assert survives("measured_human_cns", "kp", 0.001) is True  # presence suffices
    assert survives("measured_human_cns", "csf", 5.0) is True
    assert survives("predicted", "predicted_mpo", 1.0) is None
    assert survives("measured_preclinical", "kp", None) is None


def test_predicted_rule_boundaries():
    assert predict_cns_penetrant(90, 450, 3, 1.0) is True
    assert predict_cns_penetrant(90.1, 450, 3, 2.0) is False  # TPSA over
    assert predict_cns_penetrant(50, 451, 3, 2.0) is False  # MW over
    assert predict_cns_penetrant(50, 400, 4, 2.0) is False  # HBD over
    assert predict_cns_penetrant(50, 400, 2, 0.99) is False  # cLogP under
    assert predict_cns_penetrant(50, 400, 2, 5.01) is False  # cLogP over


def test_classify_activity():
    brain_plasma = "Ratio of drug level in brain against plasma in rat"
    assert classify_activity("BPR", brain_plasma) == "kp"
    assert classify_activity("Kp", brain_plasma) == "kp"
    assert classify_activity("logBB", "Brain penetration, LogBB of the compound") == "kp"
    assert classify_activity("BPR", "Blood to plasma ratio in human at 12.5 ug, po") is None
    # CSF1R / G-CSF target assays are not CNS exposure
    assert classify_activity("IC50", "Inhibition of CSF1R") is None
    assert classify_activity("IC50", "Luciferase G-CSF activity of BAF3 cell line") is None
    assert classify_activity("Ratio", "Concentration ratio in cerebrospinal fluid and plasma") == "csf_conc"
    assert classify_activity("Cmax", "Concentration ratio in cerebrospinal fluid and plasma") == "csf_conc"
    # PAMPA needs the BBB qualifier
    pampa_bbb = "Permeability of the compound across blood brain barrier by PAMPA"
    assert classify_activity("Pe", pampa_bbb) == "pampa_pe"
    assert classify_activity("logBB", pampa_bbb) == "pampa_pe"  # logBB-typed PAMPA readout
    assert classify_activity("Pe", "Caco-2 permeability by PAMPA") is None
    # predicted values are never measured evidence
    assert classify_activity("Kp", "Predicted blood-brain distribution of compound") is None
    # ex-vivo binding readouts are not exposure
    assert classify_activity("Ratio", "Binding affinity to beta-amyloid plaque in mouse brain") is None
    assert classify_activity("Ratio", "Signal-to-noise ratio in brain slices by DAPI staining") is None
    assert classify_activity("IC50", "Binding to brain receptor") is None  # binding, not exposure


def test_kp_from_row_inversion_and_percent():
    assert kp_from_row(2.0, "Ratio", "Ratio of drug level in brain to blood in rat") == 2.0
    inv = kp_from_row(2.0, "Ratio", "Ratio of drug level in blood to brain in rat")
    assert inv == 0.5  # inverted to brain:blood
    assert kp_from_row(-1.0, "logBB", "Brain penetration, LogBB") == 0.1


def test_kp_percent_units_in_build():
    import pandas as pd

    from pipelines.evidence.exposure import build_measured
    acts = pd.DataFrame([{
        "mol_chembl": "CHEMBLX", "standard_type": "BPR", "standard_value": 25.0,
        "standard_units": "%", "standard_relation": "=",
        "data_validity_comment": None,
        "description": "Ratio of drug level in brain against plasma in mouse",
        "assay_organism": "Mus musculus", "target_organism": None}])
    out, _ = build_measured(acts, {"CHEMBLX": "BRD-1"})
    assert len(out) == 1 and abs(out.iloc[0]["value"] - 0.25) < 1e-12
    assert out.iloc[0]["level"] == "measured_preclinical"


def test_build_measured_keeps_eq_and_gt_drops_flagged():
    from pipelines.evidence.exposure import build_measured
    base = {"mol_chembl": "CHEMBLX", "standard_type": "Kp",
            "standard_units": None, "description": "Ratio of brain to plasma in rat",
            "assay_organism": "Rattus norvegicus", "target_organism": None}
    acts = pd.DataFrame([
        {**base, "standard_value": 0.2, "standard_relation": "=",
         "data_validity_comment": None},
        {**base, "standard_value": 0.4, "standard_relation": ">",
         "data_validity_comment": None},
        {**base, "standard_value": 99.0, "standard_relation": "=",
         "data_validity_comment": "Outside typical range"},  # dropped
        {**base, "standard_value": 99.0, "standard_relation": "<",
         "data_validity_comment": None},  # dropped
    ])
    out, _ = build_measured(acts, {"CHEMBLX": "BRD-1"})
    assert len(out) == 1
    assert abs(out.iloc[0]["value"] - 0.3) < 1e-12  # median of 0.2 and 0.4
    assert "n_eq=1, n_gt=1" in out.iloc[0]["summary"]


def test_csf_example_descriptions_are_real_cns():
    # guard: the CSF token matcher must not fire on growth-factor assays
    assert classify_activity("Ratio", "G-CSF plasma level after dosing") is None
