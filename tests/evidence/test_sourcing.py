import pandas as pd
import pytest

from pipelines.common.paths import PROCESSED
from pipelines.evidence.sourcing import (
    SOURCE,
    build_sourcing,
    coverage,
    normalise_purity,
    purity_scale,
    read_samples,
)

HEADER = ("broad_id\tpert_iname\tqc_incompatible\tpurity\tvendor\tcatalog_no\tvendor_name\t"
          "expected_mass\tsmiles\tInChIKey\tpubchem_cid\tdeprecated_broad_id\n")
KEY_A = "AAAAAAAAAAAAAA-BBBBBBBBBB-N"  # 27 chars, two hyphens
KEY_A_SALT = "AAAAAAAAAAAAAA-CCCCCCCCCC-N"
KEY_B = "DDDDDDDDDDDDDD-EEEEEEEEEE-N"


def _row(bid, name, qc, purity, vendor, cat, key):
    return f"{bid}\t{name}\t{qc}\t{purity}\t{vendor}\t{cat}\tx\t1.0\tC\t{key}\t1\t\n"


@pytest.fixture
def samples(tmp_path):
    p = tmp_path / "samples.txt"
    p.write_text(
        "!Source\tBroad\n!File_date\t3/24/2020\n" + HEADER
        + _row("BRD-1", "drug-a", 0, "93.1", "Tocris", "T1", KEY_A)
        + _row("BRD-2", "drug-a", 0, "98.6", "Selleck", "S1", KEY_A)
        + _row("BRD-3", "drug-a", 1, "100", "Sigma", "X1", KEY_A)       # qc_incompatible: never best
        + _row("BRD-4", "drug-b", 0, "0.44", "MicroSource", "M1", KEY_B)  # a measured 0.44 %
        + _row("BRD-5", "drug-c", 0, "", "Tocris", "T2", "FFFFFFFFFFFFFF-GGGGGGGGGG-N")
        + _row("BRD-6", "named-only", 0, "96", "Enzo", "E1", "HHHHHHHHHHHHHH-IIIIIIIIII-N")
    )
    return read_samples(p)


def test_metadata_lines_skipped_and_columns_read(samples):
    assert len(samples) == 6
    assert samples["purity_pct"].tolist()[:4] == [93.1, 98.6, 100.0, 0.44]
    assert pd.isna(samples["purity_pct"].iloc[4])  # missing stays missing


def test_purity_scale_is_decided_per_column():
    pct = pd.Series(["0.44", "98.6", "100"])
    assert normalise_purity(pct).tolist() == [0.44, 98.6, 100.0]
    assert purity_scale(pct) == "percent"
    frac = pd.Series(["0.981", "0.5", None])
    out = normalise_purity(frac)
    assert out.iloc[:2].round(6).tolist() == [98.1, 50.0] and pd.isna(out.iloc[2])
    assert purity_scale(frac) == "fraction"
    assert normalise_purity(pd.Series(["97.5%"])).tolist() == [97.5]
    with pytest.raises(ValueError):
        normalise_purity(pd.Series(["120"]))


def test_matching_order_and_summary(samples):
    compounds = pd.DataFrame({
        "pert_id": ["P_FULL", "P_SALT", "P_LOW", "P_NOVAL", "P_NAME", "P_NONE", "P_BADKEY"],
        "pert_iname": ["drug-a", "drug-a-hcl", "drug-b", "drug-c", "Named Only", "nothing", "x"],
        "inchi_key": [KEY_A, KEY_A_SALT, KEY_B, "FFFFFFFFFFFFFF-GGGGGGGGGG-N",
                      "ZZZZZZZZZZZZZZ-ZZZZZZZZZZ-N", None, "-666"],
    })
    out = build_sourcing(compounds, samples).set_index("pert_id")

    full = out.loc["P_FULL"]
    assert full["match"] == "inchikey" and full["status"] == "at_or_above_95"
    assert full["best_purity_pct"] == 98.6  # the 100 % sample is qc_incompatible
    assert full["best_vendor"] == "Selleck" and full["best_catalog_no"] == "S1"
    assert full["n_samples"] == 3 and full["n_samples_at_or_above_95"] == 1
    assert full["vendors"] == "Selleck; Sigma; Tocris" and full["n_vendors"] == 3
    assert full["qc_incompatible"] and full["n_qc_incompatible"] == 1
    assert full["source"] == SOURCE

    assert out.loc["P_SALT", "match"] == "inchikey_block"
    assert out.loc["P_SALT", "best_purity_pct"] == 98.6

    low = out.loc["P_LOW"]
    assert low["status"] == "below_95" and low["best_purity_pct"] == 0.44

    noval = out.loc["P_NOVAL"]
    assert noval["status"] == "no_purity_value" and pd.isna(noval["best_purity_pct"])
    assert noval["n_samples"] == 1

    assert out.loc["P_NAME", "match"] == "name"
    assert out.loc["P_NAME", "status"] == "at_or_above_95"

    for pid in ("P_NONE", "P_BADKEY"):
        assert out.loc[pid, "status"] == "no_record" and out.loc[pid, "match"] == "none"
        assert out.loc[pid, "n_samples"] == 0 and pd.isna(out.loc[pid, "best_purity_pct"])


def test_open_targets_name_is_a_fallback(samples):
    compounds = pd.DataFrame({"pert_id": ["P"], "pert_iname": ["brd-code"], "inchi_key": [None]})
    out = build_sourcing(compounds, samples, {"P": "NAMED ONLY"})
    assert out.iloc[0]["match"] == "name"


def test_coverage_counts_pool_and_top(samples):
    compounds = pd.DataFrame({"pert_id": ["A", "B"], "pert_iname": ["drug-a", "nothing"],
                              "inchi_key": [KEY_A, None]})
    s = build_sourcing(compounds, samples)
    pool = pd.DataFrame({"pool_rank": [1, 2, 3], "pert_id": ["A", "B", "C"]})
    assert coverage(s, pool) == {"n": 3, "at_or_above_95": 1, "below_95": 0,
                                 "no_purity_value": 0, "no_record": 2}
    assert coverage(s, pool, top=1)["at_or_above_95"] == 1


@pytest.mark.data
def test_built_table_covers_pool():
    path = PROCESSED / "evidence" / "sourcing.parquet"
    if not path.exists():
        pytest.skip("run python -m pipelines.evidence.sourcing")
    s = pd.read_parquet(path)
    pool = pd.read_parquet(PROCESSED / "scores" / "GSE132903__main__candidate_pool.parquet")
    assert set(pool["pert_id"].astype(str)) <= set(s["pert_id"])
    assert s["best_purity_pct"].dropna().between(0, 100).all()
    tic = s.set_index("pert_id").loc["BRD-K34098590"]  # ticrynafen, pool rank 1
    assert tic["status"] == "at_or_above_95"
