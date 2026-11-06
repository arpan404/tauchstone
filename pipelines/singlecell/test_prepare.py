import ast
from pathlib import Path

import numpy as np
import pytest
from scipy import sparse

from pipelines.common.paths import PROCESSED, RAW
from pipelines.singlecell.prepare import pseudobulk, series_samples


def test_ambiguous_and_small_pseudobulks_dropped():
    counts = sparse.csc_matrix(np.ones((201, 30)))
    assert pseudobulk(counts, ["GFAP", "GAD1"] + ["other"] * 199) == {}


def test_no_benchmark_imports_or_output_writes():
    # No benchmark imports; all Python writes pass through the guarded output helper.
    for path in Path("pipelines/singlecell").glob("*.py"):
        if path.name.startswith("test_"):
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("pipelines.tauchstone")
            if isinstance(node, ast.Import):
                assert all(not a.name.startswith("pipelines.tauchstone") for a in node.names)
    from pipelines.singlecell.__main__ import OUT, output

    assert OUT == Path(PROCESSED) / "singlecell"
    assert output("panel.json").parent == OUT
    with pytest.raises(ValueError):
        output("../scores/bad.json")


def test_marker_assignment_sums_raw_counts():
    counts = np.ones((201, 30), dtype=int)
    counts[0] = 10
    result = pseudobulk(sparse.csc_matrix(counts), ["GFAP"] + ["other"] * 200)
    bulk, n = result["astrocytes"]
    assert n == 30
    np.testing.assert_array_equal(bulk, counts.sum(axis=1))


@pytest.mark.data
def test_real_metadata_has_only_two_per_group_gse175814():
    path = RAW / "geo/GSE175814/GSE175814_series_matrix.txt.gz"
    if not path.exists():
        pytest.skip("raw data unavailable")
    samples = series_samples(path)
    assert [s["diagnosis"] for s in samples].count("AD") == 2
    assert [s["diagnosis"] for s in samples].count("control") == 2
    assert all(s["donor"] == "unspecified" for s in samples)


@pytest.mark.data
def test_real_panel_is_complete_and_donor_gated():
    import json

    path = PROCESSED / "singlecell/panel.json"
    if not path.exists():
        pytest.skip("run make singlecell first")
    panel = json.loads(path.read_text())
    assert panel["label"] == "Exploratory, not part of the preregistered benchmark"
    assert len(panel["signatures"]) == 24
    assert [d["pool_rank"] for d in panel["drugs"]] == list(range(1, 21))
    for sig in panel["signatures"]:
        ok = min(sig["n_donors_ad"], sig["n_donors_control"]) >= 3
        assert (sig["status"] == "ok") == ok
        if sig["cohort"] == "GSE175814":
            assert not ok
        for drug in panel["drugs"]:
            score = next(s for s in drug["scores"] if s["signature_id"] == sig["signature_id"])
            assert (score["consensus"] is not None) == ok
            assert (score["scores"] is not None) == ok


def test_r_writes_are_confined_to_caller_root():
    source = Path("pipelines/singlecell/fit.R").read_text()
    assert "basename(root) == 'singlecell'" in source
    assert "file.path(root," in source
    assert "SIG_DIR(" not in source
    assert "write_output(" not in source
