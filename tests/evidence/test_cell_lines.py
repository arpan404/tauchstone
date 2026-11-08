"""Cell-line cards: field precedence, 'unspecified' for gaps, and the neural rule."""

from __future__ import annotations

import pandas as pd
import pytest

from pipelines.common.paths import PROCESSED
from pipelines.evidence import cell_lines as cl

GEO = pd.DataFrame([
    # LINCS GEO metadata has known slips (HeLa listed as large intestine); Cellosaurus wins.
    dict(cell_id="HELA", cell_type="cell line", base_cell_id="HELA", sample_type="tumor",
         primary_site="large intestine", subtype="adenocarcinoma", modification="-666",
         donor_age="31", donor_sex="F"),
    dict(cell_id="NPC", cell_type="differentiated", base_cell_id="NPC", sample_type="primary",
         primary_site="central nervous system", subtype="normal stem fibroblast-derived iPScs",
         modification="differentiated from iPSC, but not terminally differentiated",
         donor_age="-666", donor_sex="-666"),
    dict(cell_id="NPC.CAS9", cell_type="differentiated", base_cell_id="NPC",
         sample_type="primary", primary_site="central nervous system", subtype="-666",
         modification="NPC that were genetically modified", donor_age="-666", donor_sex="-666"),
    dict(cell_id="XYZ", cell_type="primary", base_cell_id="XYZ", sample_type="-666",
         primary_site="-666", subtype="-666", modification="-666", donor_age="-666",
         donor_sex="-666"),
]).set_index("cell_id")
BETA = pd.DataFrame([
    dict(cell_iname="HELA", cellosaurus_id="CVCL_0030", cell_type="tumor",
         cell_lineage="cervix", donor_sex="F", donor_age='""'),
    dict(cell_iname="NPC", cellosaurus_id='""', cell_type="normal",
         cell_lineage="central_nervous_system", donor_sex="Unknown", donor_age='""'),
]).set_index("cell_iname")
HELA = {
    "accession-list": [{"type": "primary", "value": "CVCL_0030"}],
    "name-list": [{"type": "identifier", "value": "HeLa"}],
    "category": "Cancer cell line", "sex": "Female", "age": "30Y6M",
    "disease-list": [{"label": "Human papillomavirus-related endocervical adenocarcinoma"},
                     {"label": "Cervical adenocarcinoma"}],
    "derived-from-site-list": [{"site": {"site-type": "In situ", "value": "Uterus, cervix",
                                         "xref-list": [{"label": "uterine cervix"}]}}],
}


def _built() -> pd.DataFrame:
    ids = ["HELA", "NPC", "NPC.CAS9", "XYZ"]
    acc = cl.map_accessions(ids, GEO, BETA, offline=True)
    return cl.build(ids, GEO, BETA, acc, {"CVCL_0030": HELA}).set_index("cell_id")


def test_cellosaurus_first_then_lincs():
    hela = _built().loc["HELA"]
    assert hela.cellosaurus_id == "CVCL_0030"
    assert hela.display_name == "HeLa"
    assert hela.organ == "uterine cervix"
    assert hela.age == "30 years" and hela.sex == "female"
    assert hela.disease.startswith("Human papillomavirus")
    assert hela.category == "cancer"
    assert hela.summary == "Cervical cancer cells, from a 30-year-old woman."
    assert hela.source_url == "https://www.cellosaurus.org/CVCL_0030"


def test_stem_cell_lines_and_gaps_are_unspecified():
    df = _built()
    npc = df.loc["NPC"]
    assert npc.cellosaurus_id == "unspecified"  # never name-searched: not a 'cell line'
    assert npc.category == "stem-cell derived"
    assert npc.neural and df.loc["NPC.CAS9"].neural and not df.loc["HELA"].neural
    assert npc.sex == "unspecified" and npc.age == "unspecified"
    assert "induced pluripotent" in npc.summary
    xyz = df.loc["XYZ"]
    assert (xyz[["cellosaurus_id", "organ", "disease", "sex", "age", "category"]]
            == "unspecified").all()


def test_name_match_needs_one_human_exact_hit():
    human = [{"accession": "9606"}]
    hit = lambda ac, name: {"accession-list": [{"type": "primary", "value": ac}],  # noqa: E731
                            "name-list": [{"value": name}], "species-list": human}
    assert cl.match_name("HEK293T", [hit("CVCL_0063", "HEK-293T"), hit("CVCL_X", "HEK293")]) \
        == "CVCL_0063"
    assert cl.match_name("U266", [hit("CVCL_A", "U-266"), hit("CVCL_B", "U266")]) is None
    assert cl.match_name("U266", [hit("CVCL_E5J9", "U266-PSR")]) is None


def test_neural_rule_matches_api():
    from app.services.drug_detail import _NEURAL_CELLS
    assert cl.NEURAL_CELLS == _NEURAL_CELLS


@pytest.mark.data
def test_built_table_covers_every_lincs_cell():
    df = pd.read_parquet(PROCESSED / "evidence" / "cell_lines.parquet")
    assert set(df.cell_id) == set(cl.lincs_cell_ids())
    assert df.isna().sum().sum() == 0
    mcf7 = df.set_index("cell_id").loc["MCF7"]
    assert mcf7.cellosaurus_id == "CVCL_0031" and mcf7.sex == "female" and mcf7.age == "69 years"
    assert (PROCESSED / "evidence" / "cell_lines.parquet.provenance.json").exists()


def test_images_join_and_missing_is_unspecified():
    df = cl.add_images(_built().reset_index(), [
        {"cell_id": "HELA", "caption": "HeLa cells.", "credit": "Image: Human Protein Atlas",
         "page_url": "https://v25.proteinatlas.org/x", "licence": "CC BY 4.0", "gene": "X",
         "sha256": "0" * 64}])
    df = df.set_index("cell_id")
    assert df.loc["HELA"].has_image and df.loc["HELA"].image_licence == "CC BY 4.0"
    assert not df.loc["NPC"].has_image and df.loc["NPC"].image_credit == "unspecified"
