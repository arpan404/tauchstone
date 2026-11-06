"""Minimal GCTX reader (h5py). Replaces cmapPy, which is broken on NumPy 2.

GCTX layout (CMap spec): the matrix at /0/DATA/0/matrix is stored as
(n_signatures, n_genes); row ids (genes, Entrez as strings) are at /0/META/ROW/id
and column ids (signatures, sig_id) at /0/META/COL/id.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from pathlib import Path

import h5py
import numpy as np

MATRIX = "/0/DATA/0/matrix"
ROW_IDS = "/0/META/ROW/id"
COL_IDS = "/0/META/COL/id"


def _decode(arr: np.ndarray) -> np.ndarray:
    return np.array([x.decode() if isinstance(x, bytes) else str(x) for x in arr]).astype(str)


def read_ids(path: str | Path) -> tuple[np.ndarray, np.ndarray]:
    """Return (gene_ids, signature_ids) without loading the matrix."""
    with h5py.File(path, "r") as f:
        return _decode(f[ROW_IDS][:]).astype(str), _decode(f[COL_IDS][:]).astype(str)


def iter_blocks(
    path: str | Path,
    genes: Sequence[str] | None = None,
    block_size: int = 10_000,
) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    """Yield (signature_ids, values[n_sigs_in_block, n_genes]) blocks.

    Reads whole signature rows sequentially (fast for chunked GCTX) and subsets
    genes in memory. Gene order follows `genes` when given.
    """
    gene_ids, sig_ids = read_ids(path)
    if genes is not None:
        pos = {g: i for i, g in enumerate(gene_ids)}
        missing = [g for g in genes if g not in pos]
        if missing:
            raise KeyError(f"{len(missing)} genes not in GCTX, e.g. {missing[:5]}")
        gene_idx = np.array([pos[g] for g in genes])
    else:
        gene_idx = None

    with h5py.File(path, "r") as f:
        m = f[MATRIX]
        if m.shape != (len(sig_ids), len(gene_ids)):
            raise ValueError(f"unexpected matrix shape {m.shape}")
        for start in range(0, len(sig_ids), block_size):
            stop = min(start + block_size, len(sig_ids))
            block = m[start:stop, :]
            if gene_idx is not None:
                block = block[:, gene_idx]
            yield sig_ids[start:stop], block.astype(np.float32, copy=False)


def read_matrix(path: str | Path, genes: Sequence[str] | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Load (signature_ids, values[n_sigs, n_genes]) for the requested genes into memory."""
    ids, blocks = [], []
    for sid, block in iter_blocks(path, genes):
        ids.append(sid)
        blocks.append(block)
    return np.concatenate(ids), np.vstack(blocks)


def write_gctx(path: str | Path, values: np.ndarray, gene_ids: Sequence[str], sig_ids: Sequence[str]) -> None:
    """Write a GCTX-layout file. Used by tests and small fixtures."""
    with h5py.File(path, "w") as f:
        f.create_dataset(MATRIX, data=np.asarray(values, dtype=np.float32), chunks=True)
        f.create_dataset(ROW_IDS, data=np.array(gene_ids, dtype="S"))
        f.create_dataset(COL_IDS, data=np.array(sig_ids, dtype="S"))
