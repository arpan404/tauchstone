import numpy as np
import pytest

from pipelines.lincs import gctx


def test_roundtrip_with_gene_subset(tmp_path):
    rng = np.random.default_rng(0)
    values = rng.normal(size=(25, 6)).astype(np.float32)  # 25 signatures x 6 genes
    genes = [str(g) for g in [10, 20, 30, 40, 50, 60]]
    sigs = [f"sig{i}" for i in range(25)]
    path = tmp_path / "t.gctx"
    gctx.write_gctx(path, values, genes, sigs)

    g, s = gctx.read_ids(path)
    assert list(g) == genes and list(s) == sigs

    ids, m = gctx.read_matrix(path, genes=["50", "10"])
    assert list(ids) == sigs
    np.testing.assert_allclose(m, values[:, [4, 0]])


def test_blocks_cover_all_signatures(tmp_path):
    values = np.arange(30, dtype=np.float32).reshape(10, 3)
    path = tmp_path / "t.gctx"
    gctx.write_gctx(path, values, ["1", "2", "3"], [f"s{i}" for i in range(10)])
    blocks = list(gctx.iter_blocks(path, block_size=4))
    assert [len(b[0]) for b in blocks] == [4, 4, 2]
    np.testing.assert_array_equal(np.vstack([b[1] for b in blocks]), values)


def test_missing_gene_raises(tmp_path):
    path = tmp_path / "t.gctx"
    gctx.write_gctx(path, np.zeros((2, 2)), ["1", "2"], ["a", "b"])
    with pytest.raises(KeyError):
        gctx.read_matrix(path, genes=["999"])
