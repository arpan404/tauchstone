import sqlite3

import pandas as pd
import pytest

from pipelines.common.paths import PROCESSED
from pipelines.evidence.withdrawn import build_withdrawn


@pytest.fixture
def con():
    c = sqlite3.connect(":memory:")
    c.executescript("""
    create table molecule_dictionary (molregno int, chembl_id text, withdrawn_flag int);
    create table molecule_hierarchy (molregno int, parent_molregno int, active_molregno int);
    create table drug_warning (warning_id int, molregno int, warning_type text, warning_class text,
                               warning_country text, warning_year int);
    insert into molecule_dictionary values (1,'CHEMBL_P',0),(2,'CHEMBL_SALT',1),(3,'CHEMBL_OK',0),
                                           (4,'CHEMBL_FLAGONLY',1);
    insert into molecule_hierarchy values (1,1,1),(2,1,1),(3,3,3),(4,4,4);
    insert into drug_warning values
      (10,2,'Withdrawn','hepatotoxicity','France',1982),
      (11,1,'Withdrawn','hepatotoxicity; cardiotoxicity','United States',1980),
      (12,3,'Black Box Warning','cardiotoxicity','United States',1990);
    """)
    yield c
    c.close()


def test_parent_and_salt_forms_match(con):
    approval = pd.DataFrame({"pert_id": ["A", "B", "C", "D", "E"],
                             "chembl_id": ["CHEMBL_P", "CHEMBL_SALT", "CHEMBL_OK",
                                           "CHEMBL_FLAGONLY", None]})
    out = build_withdrawn(con, approval).set_index("pert_id")
    for pid in ("A", "B"):  # parent row and salt row see the whole family
        assert out.loc[pid, "withdrawn"]
        assert out.loc[pid, "withdrawn_year"] == 1980
        assert out.loc[pid, "withdrawn_class"] == "hepatotoxicity; cardiotoxicity"
        assert out.loc[pid, "withdrawn_country"] == "United States; France"
    assert not out.loc["C", "withdrawn"]  # black box is not a withdrawal
    assert pd.isna(out.loc["C", "withdrawn_class"])
    assert out.loc["D", "withdrawn"] and pd.isna(out.loc["D", "withdrawn_year"])
    assert not out.loc["E", "withdrawn"]
    assert set(out["source"]) == {"ChEMBL 37"}


@pytest.mark.data
def test_ticrynafen_withdrawn_in_built_table():
    path = PROCESSED / "evidence" / "withdrawn.parquet"
    if not path.exists():
        pytest.skip("withdrawn.parquet not built")
    w = pd.read_parquet(path)
    assert path.with_name(path.name + ".provenance.json").exists()
    t = w[w["chembl_id"] == "CHEMBL267744"].iloc[0]
    assert t["withdrawn"] and t["withdrawn_year"] == 1980
    assert "hepatotoxicity" in t["withdrawn_class"]
