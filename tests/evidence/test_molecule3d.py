"""3D molecule JSON: schema validity, salt stripping, bond encoding, determinism, real files."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import pandas as pd
import pytest

from pipelines.evidence.molecule3d import build_molecules, drug_smiles, molecule_from_smiles
from tests.api_contract.openapi_check import check

PROCESSED = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed"
MOLECULES = PROCESSED / "evidence" / "molecules"
PIPERACILLIN = "BRD-K86873305"

ASPIRIN_SODIUM = "CC(=O)Oc1ccccc1C(=O)[O-].[Na+]"
BENZENE = "c1ccccc1"


def test_schema_and_salt_stripped():
    m = molecule_from_smiles(ASPIRIN_SODIUM)
    check(m, "Molecule3D")
    assert m["formula"] == "C9H7O4-"  # parent fragment only, counter-ion stripped
    assert "Na" not in {a["el"] for a in m["atoms"]}
    assert len(m["atoms"]) == 13  # heavy atoms only
    assert "ETKDGv3" in m["method"] and "20261105" in m["method"]


def test_aromatic_bonds_are_4_and_centred():
    m = molecule_from_smiles(BENZENE)
    assert m["formula"] == "C6H6"
    assert sorted({b[2] for b in m["bonds"]}) == [4]
    for axis in ("x", "y", "z"):
        assert abs(sum(a[axis] for a in m["atoms"]) / len(m["atoms"])) < 1e-2
    # C-C aromatic bond lengths are about 1.39 angstrom after MMFF.
    a = m["atoms"]
    for i, j, _ in m["bonds"]:
        d = math.dist((a[i]["x"], a[i]["y"], a[i]["z"]), (a[j]["x"], a[j]["y"], a[j]["z"]))
        assert 1.3 < d < 1.5


def test_bond_orders_single_double_triple():
    m = molecule_from_smiles("C#CC=CC")
    assert sorted(b[2] for b in m["bonds"]) == [1, 1, 2, 3]


def test_deterministic():
    assert molecule_from_smiles("CCN(CC)C(=O)c1ccccc1") == molecule_from_smiles("CCN(CC)C(=O)c1ccccc1")


def test_bad_smiles_raises():
    with pytest.raises(ValueError):
        molecule_from_smiles("not a smiles")


def test_build_on_fixture(tmp_path: Path):
    base = tmp_path / "processed"
    (base / "scores").mkdir(parents=True)
    (base / "lincs").mkdir(parents=True)
    pd.DataFrame({"pert_id": ["BRD-1"]}).to_parquet(
        base / "scores" / "Q__candidate_pool.parquet")
    pd.DataFrame({"pert_id": ["BRD-1", "BRD-2", "BRD-3", "BRD-4"]}).to_parquet(
        base / "scores" / "Q__compound_ranking.parquet")
    pd.DataFrame({
        "pert_id": ["BRD-1", "BRD-2", "BRD-3", "BRD-4"],
        "canonical_smiles": [BENZENE, "-666", "restricted", "C1CC"],
    }).to_parquet(base / "lincs" / "compounds.parquet")
    assert drug_smiles(base, "Q")["smiles"].isna().sum() == 2
    man = build_molecules(base, "Q", workers=1)
    assert man["generated"] == ["BRD-1"]
    assert set(man["failed"]) == {"BRD-4"}  # unparsable ring, recorded not fatal
    assert man["no_smiles"] == ["BRD-2", "BRD-3"]
    out = base / "evidence" / "molecules"
    check(json.loads((out / "BRD-1.json").read_text()), "Molecule3D")
    prov = json.loads((out / "_manifest.json.provenance.json").read_text())
    assert prov["random_seed"] == 20261105
    assert prov["parameters"]["failures"] == man["failed"]


@pytest.mark.data
def test_real_piperacillin():
    path = MOLECULES / f"{PIPERACILLIN}.json"
    if not path.exists():
        pytest.skip("run `make molecules` first")
    m = json.loads(path.read_text())
    check(m, "Molecule3D")
    assert m["formula"] == "C23H27N5O7S"
    assert len(m["atoms"]) == 36


@pytest.mark.data
def test_real_manifest_covers_pool():
    man_path = MOLECULES / "_manifest.json"
    if not man_path.exists():
        pytest.skip("run `make molecules` first")
    man = json.loads(man_path.read_text())
    pool = pd.read_parquet(PROCESSED / "scores" / "GSE132903__main__candidate_pool.parquet")
    accounted = set(man["generated"]) | set(man["failed"]) | set(man["no_smiles"])
    assert set(pool["pert_id"].astype(str)) <= accounted
    assert man["n_generated"] > 0.95 * man["n_drugs"]
    for pid in man["generated"][:50]:
        check(json.loads((MOLECULES / f"{pid}.json").read_text()), "Molecule3D")
