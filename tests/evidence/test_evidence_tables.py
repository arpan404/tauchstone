import pandas as pd

from pipelines.evidence.ad_association import build_ad_association
from pipelines.evidence.brain_expression import build_brain_expression, load_cell_types, load_regions
from pipelines.evidence.structures import select_structures


def test_ad_association_null_when_missing():
    overall = pd.DataFrame([{"targetId": "ENSG1", "associationScore": 0.8}])
    datatype = pd.DataFrame([{"targetId": "ENSG1", "aggregationValue": "genetic_association",
                              "associationScore": 0.9}])
    out = build_ad_association(pd.Series(["ENSG1", "ENSG2"]), overall, datatype)
    assert len(out) == 2
    assert out.set_index("ensembl_id").loc["ENSG1", "score"] == 0.8
    assert pd.isna(out.set_index("ensembl_id").loc["ENSG2", "score"])
    import json
    assert json.loads(out.set_index("ensembl_id").loc["ENSG1", "datatype_scores"]) == \
        {"genetic_association": 0.9}
    assert out.iloc[0]["source_url"].endswith("/ENSG1/MONDO_0004975")


def _write_tsv(path, header, rows):
    path.write_text(header + "\n" + "\n".join(rows) + "\n")
    return str(path)


def test_hpa_region_max_aggregation(tmp_path):
    p = _write_tsv(tmp_path / "regions.tsv", "Gene\tBrain region\tTPM\tpTPM\tnTPM",
                   ["ENSG1\tcerebral cortex\t1.0\t1.0\t1.0",
                    "ENSG1\tcerebral cortex\t2.0\t2.0\t3.0",
                    "ENSG1\tcerebellum\t0.5\t0.5\t0.5"])
    regions = load_regions(p)
    assert len(regions) == 2  # max aggregation, not duplicated
    assert regions.set_index("context").loc["cerebral cortex", "ntpm"] == 3.0


def test_cell_type_filter_and_mapping(tmp_path):
    p = _write_tsv(tmp_path / "cells.tsv", "Gene\tCell type\tnCPM",
                   ["ENSG1\tmicroglia\t5.0",
                    "ENSG1\tbrain excitatory neurons\t6.0",
                    "ENSG1\toligodendrocyte progenitor cells\t7.0",
                    "ENSG1\thepatocytes\t99.0",
                    "ENSG1\tother brain neurons\t8.0"])
    cells = load_cell_types(p)
    assert set(cells["context"]) == {"microglia", "excitatory neurons",
                                     "oligodendrocyte progenitor cells"}
    assert "hepatocytes" not in set(cells["context"])
    assert "other brain neurons" not in set(cells["context"])


def test_brain_expression_drops_unmapped_entrez():
    targets = pd.DataFrame([{"ensembl_id": "ENSG1", "entrez_id": "101"},
                            {"ensembl_id": "ENSG9", "entrez_id": None}])
    regions = pd.DataFrame([{"ensembl_id": ["ENSG1", "ENSG9"][i % 2],
                             "context": "cerebral cortex", "ntpm": 1.0} for i in range(2)])
    cells = pd.DataFrame([{"ensembl_id": "ENSG1", "context": "microglia", "ntpm": 2.0}])
    out = build_brain_expression(targets, regions=regions, cells=cells)
    assert set(out["entrez_id"]) == {"101"}
    assert set(out["kind"]) == {"region", "cell_type"}


def test_structure_selection_order():
    sifts = pd.DataFrame([
        {"PDB": ["1aaa", "1aaa", "2bbb", "3ccc", "4ddd"][i],
         "CHAIN": "A", "SP_PRIMARY": "P00001",
         "SP_BEG": 1, "SP_END": [100, 100, 200, 50, 300][i],
         "pdb_id": ["1AAA", "1AAA", "2BBB", "3CCC", "4DDD"][i]} for i in range(5)])
    # 1AAA has two chains covering 100 each -> span 200; 4DDD single 300
    entry_types = pd.DataFrame([
        {"pdb_id": "1AAA", "mol_type": "prot", "method": "X-ray"},
        {"pdb_id": "2BBB", "mol_type": "prot", "method": "NMR"},
        {"pdb_id": "3CCC", "mol_type": "nuc", "method": "X-ray"},
        {"pdb_id": "4DDD", "mol_type": "prot", "method": "EM"},
    ])
    resolution = {"1AAA": 2.5, "3CCC": 1.0, "4DDD": 3.0}  # 2BBB NMR -> missing
    sel = select_structures(sifts, entry_types, resolution, ["P00001", "P99999"])
    assert len(sel) == 1  # only P00001 has SIFTS rows
    # X-ray/EM beat NMR; protein type beats nuc; among X-ray prot (1AAA) vs EM prot (4DDD):
    # method rank ties (both preferred), type ties, resolution 2.5 < 3.0 -> 1AAA
    assert sel.iloc[0]["pdb_id"] == "1AAA"
    assert sel.iloc[0]["resolution_angstrom"] == 2.5


def test_structure_prefers_coverage_then_id():
    sifts = pd.DataFrame([
        {"PDB": "2bbb", "CHAIN": "A", "SP_PRIMARY": "P1", "SP_BEG": 1, "SP_END": 100,
         "pdb_id": "2BBB"},
        {"PDB": "1aaa", "CHAIN": "A", "SP_PRIMARY": "P1", "SP_BEG": 1, "SP_END": 100,
         "pdb_id": "1AAA"},
    ])
    entry_types = pd.DataFrame([
        {"pdb_id": "1AAA", "mol_type": "prot", "method": "X-ray"},
        {"pdb_id": "2BBB", "mol_type": "prot", "method": "X-ray"},
    ])
    sel = select_structures(sifts, entry_types, {"1AAA": 2.0, "2BBB": 2.0}, ["P1"])
    assert sel.iloc[0]["pdb_id"] == "1AAA"  # tie on everything -> lower pdb_id
