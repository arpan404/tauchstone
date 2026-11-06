import ast
from pathlib import Path

import numpy as np
import pytest
from scipy import sparse

from pipelines.common.paths import RAW
from pipelines.singlecell.prepare import pseudobulk, series_samples


def test_ambiguous_and_small_pseudobulks_dropped():
    counts = sparse.csc_matrix(np.ones((201, 30)))
    assert pseudobulk(counts, ['GFAP', 'GAD1'] + ['other'] * 199) == {}


def test_no_benchmark_imports_or_output_writes():
    # Preparation is read-only. No output stage may be added without extending this guard.
    for path in Path('pipelines/singlecell').glob('*.py'):
        if path.name.startswith('test_'):
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or '').startswith('pipelines.tauchstone')
            if isinstance(node, ast.Import):
                assert all(not a.name.startswith('pipelines.tauchstone') for a in node.names)
            if isinstance(node, ast.Attribute):
                assert node.attr not in {'write_text', 'write_bytes', 'to_parquet', 'to_csv', 'mkdir'}


def test_marker_assignment_sums_raw_counts():
    counts = np.ones((201, 30), dtype=int)
    counts[0] = 10
    result = pseudobulk(sparse.csc_matrix(counts), ['GFAP'] + ['other'] * 200)
    bulk, n = result['astrocytes']
    assert n == 30
    np.testing.assert_array_equal(bulk, counts.sum(axis=1))


@pytest.mark.data
def test_real_metadata_has_only_two_per_group_gse175814():
    path = RAW / 'geo/GSE175814/GSE175814_series_matrix.txt.gz'
    if not path.exists():
        pytest.skip('raw data unavailable')
    samples = series_samples(path)
    assert [s['diagnosis'] for s in samples].count('AD') == 2
    assert [s['diagnosis'] for s in samples].count('control') == 2
    assert all(s['donor'] == 'unspecified' for s in samples)
