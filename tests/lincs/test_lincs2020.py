"""LINCS 2020 ingest on a tiny synthetic fixture (no download needed), plus manifest guards."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from pipelines.lincs import gctx, lincs2020

REPO = Path(__file__).resolve().parents[2]

SIGINFO = """\
bead_batch\tpert_dose\tpert_dose_unit\tpert_idose\tpert_itime\tpert_time\tpert_time_unit\tcell_mfc_name\tnsample\tcc_q75\ttas\tpct_self_rank_q25\tis_hiq\tqc_pass\tpert_id\tsig_id\tpert_type\tcell_iname\tcmap_name\tis_exemplar_sig
b1\t10\tuM\t10 uM\t24 h\t24\th\tA549\t3\t0.49\t0.36\t0.01\t1\t1\tBRD-A\tP1_A549:BRD-A:10:24\ttrt_cp\tA549\tdrugA\t1
b1\t500\tnM\t500 nM\t6 h\t6\th\tA549\t2\t0.40\t0.20\t0.05\t0\t1\tBRD-A\tP1_A549:BRD-A:0.5:6\ttrt_cp\tA549\tdrugA\t0
b1\t100\tug/ml\tx\t336 h\t336\th\tN8\t4\t0.61\t0.53\t0\t1\t1\tBRD-B\tP2_N8:BRD-B:100:336\ttrt_cp\tNAMEC8\tdrugB\t0
b1\t-666\t-666\t-666\t24 h\t24\th\tHT29\t2\t-666\t0.10\t0.2\t0\t0\tBRD-C\tP3_HT29:BRD-C:-666:24\ttrt_cp\tHT29\tdrugC\t0
b1\t\t\t\t24 h\t24\th\tA549\t5\t0.7\t0.5\t0\t1\t1\tDMSO\tP1_A549:DMSO:24\tctl_vehicle\tA549\tDMSO\t0
b1\t10\tuM\t10 uM\t24 h\t24\th\tA549\t3\t0.49\t0.36\t0.01\t1\t1\tBRD-D\tP9_A549:BRD-D:10:24\ttrt_cp\tA549\tdrugD\t0
"""

GENEINFO = """\
gene_id\tgene_symbol\tensembl_id\tgene_title\tgene_type\tsrc\tfeature_space
2670\tGFAP\tENSG00000131095\tglial fibrillary acidic protein\tprotein-coding\tNCBI\tlandmark
6750\tSST\tENSG00000157005\tsomatostatin\tprotein-coding\tNCBI\tlandmark
10\tNAT2\tENSG00000156006\tN-acetyltransferase 2\tprotein-coding\tNCBI\tbest inferred
7503\tXIST\tENSG00000229807\tX inactive specific transcript\tncRNA\tNCBI\tinferred
7425\tVGF\t""\tVGF nerve growth factor inducible\tprotein-coding\tNCBI\tlandmark
"""

COMPOUNDINFO = """\
pert_id\tcmap_name\ttarget\tmoa\tcanonical_smiles\tinchi_key\tcompound_aliases
BRD-A\tdrugA\tHDAC1\tHDAC inhibitor\tCCO\tKEY-A\tdrug-a
BRD-A\tdrugA\tHDAC2\tHDAC inhibitor\tCCO\tKEY-A\tdrug-a
BRD-B\tdrugB\t""\t""\t""\t""\t""
BRD-D\tdrugD\tEGFR\tEGFR inhibitor\tC1CC1\tKEY-D\t
"""

GENES_IN_GCTX = ["10", "2670", "6750", "7425", "7503"]  # file order != Entrez-sorted landmark order


@pytest.fixture
def raw(tmp_path):
    d = tmp_path / "raw"
    d.mkdir()
    (d / lincs2020.FILES["sig_info"]).write_text(SIGINFO)
    (d / lincs2020.FILES["gene_info"]).write_text(GENEINFO)
    (d / lincs2020.FILES["compound_info"]).write_text(COMPOUNDINFO)
    # GCTX has the four trt_cp signatures (BRD-D is in siginfo but not the GCTX) plus a ctl one.
    sigs = ["P3_HT29:BRD-C:-666:24", "P1_A549:BRD-A:10:24", "P1_A549:DMSO:24",
            "P2_N8:BRD-B:100:336", "P1_A549:BRD-A:0.5:6"]
    values = np.arange(len(sigs) * len(GENES_IN_GCTX), dtype=np.float32).reshape(len(sigs), -1)
    gctx.write_gctx(d / lincs2020.FILES["gctx"], values, GENES_IN_GCTX, sigs)
    return d, dict(zip(sigs, values, strict=True))


def test_dose_and_time_normalisation():
    assert lincs2020.normalise_dose("10", "uM") == (10.0, "uM")
    assert lincs2020.normalise_dose("500", "nM") == (0.5, "uM")
    assert lincs2020.normalise_dose("100", "ug/ml") == (100.0, "ug/ml")  # never converted
    for v, u in [("-666", "-666"), ("", ""), ("10", ""), ("abc", "uM")]:
        val, unit = lincs2020.normalise_dose(v, u)
        assert unit == "unspecified" and np.isnan(val)
    assert lincs2020.normalise_time("24", "h") == (24.0, "h")
    assert lincs2020.normalise_time("-666", "h")[1] == "unspecified"


def test_genes_entrez_strings_and_landmark_order(raw):
    d, _ = raw
    genes, order = lincs2020.load_genes(d / lincs2020.FILES["gene_info"], expect_landmarks=3)
    assert genes["entrez_id"].map(type).eq(str).all()
    assert order["entrez_id"].tolist() == ["2670", "6750", "7425"]  # Entrez ascending, like 2017
    bing = set(genes.loc[genes["is_bing"], "symbol"])
    assert bing == {"GFAP", "SST", "VGF", "NAT2"}  # BING includes landmarks
    assert genes.set_index("symbol").loc["VGF", "ensembl_id"] is None
    with pytest.raises(ValueError, match="landmark"):
        lincs2020.load_genes(d / lincs2020.FILES["gene_info"], expect_landmarks=978)


def test_sig_info_frozen_shape(raw):
    d, _ = raw
    _, gctx_sigs = gctx.read_ids(d / lincs2020.FILES["gctx"])
    si, stats = lincs2020.load_sig_info(d / lincs2020.FILES["sig_info"], gctx_sigs)
    assert list(si.columns) == lincs2020.FROZEN_SIG_COLUMNS + lincs2020.EXTRA_SIG_COLUMNS
    assert "is_gold" not in si.columns
    assert stats["n_trt_cp_siginfo"] == 5 and stats["n_trt_cp_not_in_gctx"] == 1
    assert set(si["pert_id"]) == {"BRD-A", "BRD-B", "BRD-C"}  # controls dropped, BRD-D not in GCTX
    assert (si["row"].to_numpy() == np.arange(len(si))).all()
    assert (si["source"] == "LINCS2020").all()
    by = si.set_index("sig_id")
    assert by.loc["P1_A549:BRD-A:0.5:6", "pert_idose"] == "0.5 uM"
    assert by.loc["P1_A549:BRD-A:10:24", "context_id"] == "A549|10 uM|24 h"
    assert by.loc["P2_N8:BRD-B:100:336", "pert_idose"] == "100 ug/ml"
    assert by.loc["P2_N8:BRD-B:100:336", "cell_id"] == "NAMEC8"
    c = by.loc["P3_HT29:BRD-C:-666:24"]
    assert c["pert_idose"] == "unspecified" and c["pert_dose_unit"] == "unspecified"
    assert np.isnan(c["pert_dose"]) and np.isnan(c["distil_cc_q75"])  # recorded missing, not imputed
    assert by.loc["P1_A549:BRD-A:10:24", "pert_iname"] == "drugA"
    assert bool(by.loc["P1_A549:BRD-A:10:24", "is_exemplar_sig"]) is True


def test_frozen_split_tag_is_metadata_only(raw):
    d, _ = raw
    si, _ = lincs2020.load_sig_info(d / lincs2020.FILES["sig_info"])
    split = pd.DataFrame({"pert_id": ["BRD-A", "BRD-A"], "context_id": ["A549|10 uM|24 h", "A549|0.5 uM|6 h"],
                          "split": ["ranking", "held_out"]})
    tagged = lincs2020.tag_frozen_split(si, split)
    assert len(tagged) == len(si) and list(tagged.columns) == list(si.columns)
    tag = tagged.set_index("sig_id")["frozen_split"]
    assert tag["P1_A549:BRD-A:10:24"] == "ranking"
    assert tag["P1_A549:BRD-A:0.5:6"] == "held_out"
    assert tag["P2_N8:BRD-B:100:336"] == "not_in_frozen_split"


def test_frozen_split_tag_by_sig_id_and_whole_context(raw):
    d, _ = raw
    si, _ = lincs2020.load_sig_info(d / lincs2020.FILES["sig_info"])
    # 2017 wrote BRD-C's context differently, so only the sig_id route can find it.
    old = pd.DataFrame({"sig_id": ["P3_HT29:BRD-C:-666:24"], "pert_id": ["BRD-C"],
                        "context_id": ["HT29|9.99 uM|24 h"]})
    split = pd.DataFrame({"pert_id": ["BRD-C", "BRD-A"], "context_id": ["HT29|9.99 uM|24 h", "A549|10 uM|24 h"],
                          "split": ["held_out", "ranking"]})
    assert lincs2020.tag_frozen_split(si, split).set_index("sig_id").loc[
        "P3_HT29:BRD-C:-666:24", "frozen_split"] == "not_in_frozen_split"
    tag = lincs2020.tag_frozen_split(si, split, old).set_index("sig_id")["frozen_split"]
    assert tag["P3_HT29:BRD-C:-666:24"] == "held_out"
    assert tag["P1_A549:BRD-A:10:24"] == "ranking"
    # A new 2020 signature sharing a 2020 context with a held-out one is held out too.
    extra = si.iloc[[3]].assign(sig_id="NEW:BRD-C", row=len(si))
    both = pd.concat([si, extra], ignore_index=True)
    tag2 = lincs2020.tag_frozen_split(both, split, old).set_index("sig_id")["frozen_split"]
    assert tag2["NEW:BRD-C"] == "held_out"


def test_compounds_collapse_one_row_per_pert(raw):
    d, _ = raw
    si, _ = lincs2020.load_sig_info(d / lincs2020.FILES["sig_info"])
    comp = lincs2020.load_compounds(d / lincs2020.FILES["compound_info"], si)
    assert comp["pert_id"].is_unique
    a = comp.set_index("pert_id").loc["BRD-A"]
    assert a["target"] == "HDAC1|HDAC2" and a["inchi_key"] == "KEY-A" and a["n_signatures"] == 2
    b = comp.set_index("pert_id").loc["BRD-B"]
    assert pd.isna(b["canonical_smiles"]) and pd.isna(b["target"])
    c = comp.set_index("pert_id").loc["BRD-C"]  # in siginfo, absent from compoundinfo
    assert c["pert_iname"] == "drugC" and pd.isna(c["inchi_key"])


def test_metadata_and_matrix_end_to_end(raw, tmp_path):
    d, values = raw
    out = tmp_path / "out"
    stats = lincs2020.run_metadata(d, out, frozen_split=None, expect_landmarks=3)
    assert stats["gctx_ids_checked"] and stats["n_trt_cp"] == 4
    for name in ["genes.parquet", "landmark_order.parquet", "sig_info.parquet", "compounds.parquet"]:
        prov = json.loads((out / f"{name}.provenance.json").read_text())
        assert prov["validation_context"] == lincs2020.VALIDATION_CONTEXT
        assert prov["dataset_accession"] == lincs2020.ACCESSION
    lincs2020.run_matrix(d, out)
    m = np.load(out / "level5_landmark_f32.npy")
    si = pd.read_parquet(out / "sig_info.parquet")
    lm = pd.read_parquet(out / "landmark_order.parquet")["entrez_id"].tolist()
    assert m.shape == (4, 3) and m.dtype == np.float32
    cols = [GENES_IN_GCTX.index(g) for g in lm]
    for sid, row in zip(si["sig_id"], si["row"], strict=True):
        np.testing.assert_array_equal(m[row], values[sid][cols])
    assert (out / "level5_landmark_f32.npy.provenance.json").exists()


def test_refuses_frozen_output_folder(raw):
    d, _ = raw
    with pytest.raises(ValueError, match="frozen"):
        lincs2020.run_metadata(d, lincs2020.PROCESSED / "lincs", frozen_split=None, expect_landmarks=3)


def test_s3_multipart_etag(tmp_path):
    data = bytes(range(256)) * 9000  # 2.3 MB -> 3 parts of 1 MiB
    p = tmp_path / "f.bin"
    p.write_bytes(data)
    mib = 1 << 20
    parts = [data[i:i + mib] for i in range(0, len(data), mib)]
    expected = hashlib.md5(b"".join(hashlib.md5(x).digest() for x in parts)).hexdigest() + f"-{len(parts)}"
    assert lincs2020.s3_etag(p, mib) == expected
    assert mib in lincs2020.part_size_candidates(len(data), 3)
    assert lincs2020.etag_matches(p, f'"{expected}"')
    assert lincs2020.etag_matches(p, hashlib.md5(data).hexdigest())
    assert not lincs2020.etag_matches(p, "0" * 32 + "-3")


def _dry_run(*args: str) -> str:
    return subprocess.run([sys.executable, "-I", str(REPO / "scripts" / "fetch_data.py"), "--dry-run", *args],
                          capture_output=True, text=True, check=True).stdout


def test_lincs2020_is_opt_in_only():
    assert "LINCS2020" not in _dry_run("--tier", "core")
    assert "LINCS2020" not in _dry_run("--tier", "all")  # what `make data` runs
    picked = _dry_run("--tier", "all", "--group", "lincs/LINCS2020")
    assert picked.count("lincs/LINCS2020\t") == 7
    assert "level5_beta_trt_cp_n720216x12328.gctx" in picked
    assert "GSE92742" in _dry_run("--tier", "core")
