"""Real top-10 target structures: parse mmCIF and check offline API bytes.

Install gemmi separately for this optional data check, e.g.
uv run --with gemmi pytest tests/redteam/test_structure_files.py -q
No processed files are written. Structures are target context, not binding evidence.
"""
from __future__ import annotations

import pandas as pd
import pytest
from app.deps import get_repository
from app.main import app
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from tests.leakage._paths import POOL, PROCESSED, needs_data, require

pytestmark = needs_data


def top_ten_targets():
    require(POOL, "evidence/targets.parquet", "evidence/structures.parquet")
    pool = pd.read_parquet(PROCESSED / POOL).query("pool_rank <= 10")
    targets = pd.read_parquet(PROCESSED / "evidence/targets.parquet")
    structures = pd.read_parquet(PROCESSED / "evidence/structures.parquet")
    return pool[["pool_rank", "pert_id"]].merge(targets, on="pert_id", how="left").merge(
        structures, on="uniprot", how="left"
    )


def test_top_ten_structure_files():
    gemmi = pytest.importorskip("gemmi", reason="run with uv run --with gemmi for mmCIF validation")
    rows = top_ten_targets()
    assert set(rows.pool_rank) == set(range(1, 11))
    mapped = rows[rows.uniprot.notna()]
    assert len(mapped) > 0, "No mapped top-10 targets to validate"
    assert mapped.pdb_id.notna().all(), "Mapped target missing a structure"
    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_repository] = lambda: ParquetRepository(PROCESSED)
    try:
        with TestClient(app) as client:
            for row in mapped.itertuples():
                path = PROCESSED / "evidence" / row.local_path
                assert path.is_file(), row.pdb_id
                block = gemmi.cif.read_file(str(path)).sole_block()
                structure = gemmi.make_structure_from_block(block)
                assert sum(model.count_atom_sites() for model in structure) > 0, row.pdb_id
                response = client.get(f"/structures/{row.pdb_id}.cif")
                assert response.status_code == 200, row.pdb_id
                assert response.content == path.read_bytes(), row.pdb_id
                assert response.headers["content-type"].startswith("chemical/x-cif")
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
