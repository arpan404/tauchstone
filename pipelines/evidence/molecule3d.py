"""3D coordinates for every ranked drug (heavy atoms only), one JSON per pert_id.

Inputs: ``scores/{ranking}__candidate_pool.parquet`` and ``scores/{ranking}__compound_ranking.parquet``
(which drugs) plus ``lincs/compounds.parquet`` (``canonical_smiles``; LINCS uses ``-666`` for
missing). Output: ``evidence/molecules/{pert_id}.json`` matching the ``Molecule3D`` schema in
``contracts/openapi.yaml``, and ``evidence/molecules/_manifest.json`` (status per drug, failures
with their reason) with a provenance sidecar.

Method: RDKit MolFromSmiles, keep the largest fragment (strips salts and counter-ions), AddHs,
ETKDGv3 embedding with a fixed seed, MMFF94 optimisation (UFF fallback), then RemoveHs. Atoms are
centred at the origin. Bond orders are 1, 2, 3, and 4 for aromatic.

These are computed conformers for display; they are not experimental structures and say nothing
about target binding.
"""

from __future__ import annotations

import argparse
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

from pipelines.common.paths import PROCESSED
from pipelines.common.provenance import Provenance

SEED = 20261105
PRIMARY_RANKING = "GSE132903__main"
MISSING_SMILES = {"", "-666", "nan", "None", "restricted"}  # LINCS placeholders
EMBED_TIMEOUT_S = 60
MMFF_MAX_ITERS = 2000


def _largest_fragment(mol):
    from rdkit import Chem

    frags = Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=True)
    if len(frags) == 1:
        return frags[0]
    # Most heavy atoms first; ties broken by total atoms then canonical SMILES (deterministic).
    return max(
        frags,
        key=lambda f: (f.GetNumHeavyAtoms(), f.GetNumAtoms(), Chem.MolToSmiles(f)),
    )


def _bond_order(bond) -> int:
    from rdkit import Chem

    if bond.GetIsAromatic() or bond.GetBondType() == Chem.BondType.AROMATIC:
        return 4
    bt = bond.GetBondType()
    if bt == Chem.BondType.DOUBLE:
        return 2
    if bt == Chem.BondType.TRIPLE:
        return 3
    return 1


def molecule_from_smiles(smiles: str, seed: int = SEED) -> dict:
    """Molecule3D dict for one SMILES. Raises ``ValueError`` with a reason on failure."""
    import rdkit
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from rdkit.Chem.rdMolDescriptors import CalcMolFormula

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("RDKit could not parse the SMILES")
    parent = _largest_fragment(mol)
    formula = CalcMolFormula(parent)
    parent_smiles = Chem.MolToSmiles(parent)
    molh = Chem.AddHs(parent)

    params = AllChem.ETKDGv3()
    params.randomSeed = seed
    if hasattr(params, "timeout"):
        params.timeout = EMBED_TIMEOUT_S
    status = AllChem.EmbedMolecule(molh, params)
    embed_note = ""
    if status != 0:
        params.useRandomCoords = True
        status = AllChem.EmbedMolecule(molh, params)
        embed_note = " (random-coordinate start)"
    if status != 0:
        raise ValueError("ETKDGv3 embedding failed")

    ff = "no force-field optimisation"
    try:
        if AllChem.MMFFHasAllMoleculeParams(molh):
            AllChem.MMFFOptimizeMolecule(molh, maxIters=MMFF_MAX_ITERS)
            ff = "MMFF94"
        elif AllChem.UFFHasAllMoleculeParams(molh):
            AllChem.UFFOptimizeMolecule(molh, maxIters=MMFF_MAX_ITERS)
            ff = "UFF"
    except (RuntimeError, ValueError):
        ff = "no force-field optimisation"

    heavy = Chem.RemoveHs(molh)
    pos = np.asarray(heavy.GetConformer().GetPositions(), dtype=float)
    pos = pos - pos.mean(axis=0)
    atoms = [
        {"el": a.GetSymbol(), "x": round(float(x), 3), "y": round(float(y), 3), "z": round(float(z), 3)}
        for a, (x, y, z) in zip(heavy.GetAtoms(), pos, strict=True)
    ]
    bonds = [
        [int(b.GetBeginAtomIdx()), int(b.GetEndAtomIdx()), _bond_order(b)]
        for b in heavy.GetBonds()
    ]
    return {
        "formula": formula,
        "smiles": parent_smiles,
        "atoms": atoms,
        "bonds": bonds,
        "method": f"RDKit {rdkit.__version__} ETKDGv3{embed_note} + {ff}, seed {seed}",
    }


def _work(task: tuple[str, str, str, int]) -> tuple[str, str | None]:
    """Worker: write one JSON. Returns (pert_id, error or None)."""
    pert_id, smiles, out_dir, seed = task
    try:
        mol = molecule_from_smiles(smiles, seed=seed)
    except Exception as e:  # noqa: BLE001 - any RDKit failure is recorded, never fatal
        return pert_id, f"{type(e).__name__}: {e}"
    path = Path(out_dir) / f"{pert_id}.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(mol, separators=(",", ":")))
    tmp.replace(path)
    return pert_id, None


def drug_smiles(processed: Path = PROCESSED, ranking: str = PRIMARY_RANKING) -> pd.DataFrame:
    """pert_id + canonical_smiles for the candidate pool plus every ranked compound.

    Rows with no SMILES (``-666``, ``restricted`` or empty) keep ``smiles = None`` so they are reported, not dropped.
    """
    pool = pd.read_parquet(processed / "scores" / f"{ranking}__candidate_pool.parquet", columns=["pert_id"])
    ranked = pd.read_parquet(processed / "scores" / f"{ranking}__compound_ranking.parquet", columns=["pert_id"])
    ids = sorted(set(pool["pert_id"].astype(str)) | set(ranked["pert_id"].astype(str)))
    comp = pd.read_parquet(processed / "lincs" / "compounds.parquet", columns=["pert_id", "canonical_smiles"])
    comp["pert_id"] = comp["pert_id"].astype(str)
    by_id = comp.drop_duplicates("pert_id").set_index("pert_id")["canonical_smiles"]
    smiles = []
    for pid in ids:
        s = by_id.get(pid)
        s = None if s is None or pd.isna(s) or str(s).strip() in MISSING_SMILES else str(s).strip()
        smiles.append(s)
    return pd.DataFrame({"pert_id": ids, "smiles": smiles})


def build_molecules(
    processed: Path = PROCESSED,
    ranking: str = PRIMARY_RANKING,
    seed: int = SEED,
    workers: int | None = None,
    limit: int | None = None,
) -> dict:
    """Generate every molecule JSON and the manifest; returns the manifest dict."""
    import rdkit

    out_dir = processed / "evidence" / "molecules"
    out_dir.mkdir(parents=True, exist_ok=True)
    drugs = drug_smiles(processed, ranking)
    if limit:
        drugs = drugs.head(limit)
    no_smiles = drugs[drugs["smiles"].isna()]["pert_id"].tolist()
    todo = drugs.dropna(subset=["smiles"])
    tasks = [(r.pert_id, r.smiles, str(out_dir), seed) for r in todo.itertuples()]
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    failures: dict[str, str] = {}
    ok: list[str] = []
    with Pool(workers) as pool:
        for i, (pid, err) in enumerate(pool.imap_unordered(_work, tasks, chunksize=8), 1):
            if err:
                failures[pid] = err
            else:
                ok.append(pid)
            if i % 500 == 0:
                print(f"  {i}/{len(tasks)} done ({len(failures)} failed)", flush=True)
    manifest = {
        "n_drugs": int(len(drugs)),
        "n_generated": len(ok),
        "n_failed": len(failures),
        "n_no_smiles": len(no_smiles),
        "generated": sorted(ok),
        "failed": dict(sorted(failures.items())),
        "no_smiles": sorted(no_smiles),
    }
    man_path = out_dir / "_manifest.json"
    man_path.write_text(json.dumps(manifest, indent=1) + "\n")
    Provenance(
        step="molecule3d",
        dataset_accession="LINCS-L1000",
        model="RDKit ETKDGv3 + MMFF94 (UFF fallback), largest fragment, heavy atoms only",
        parameters={
            "rdkit_version": rdkit.__version__,
            "ranking": ranking,
            "drug_set": f"{ranking}__candidate_pool union {ranking}__compound_ranking",
            "smiles_source": "lincs/compounds.parquet canonical_smiles ('-666' = missing)",
            "embed_timeout_s": EMBED_TIMEOUT_S,
            "mmff_max_iters": MMFF_MAX_ITERS,
            "bond_order_encoding": "1 single, 2 double, 3 triple, 4 aromatic",
            "coordinates": "angstrom, heavy-atom centroid at origin, rounded to 0.001",
            "n_generated": len(ok),
            "n_failed": len(failures),
            "n_no_smiles": len(no_smiles),
            "failures": dict(sorted(failures.items())),
            "workers": workers,
        },
        random_seed=seed,
        validation_context="none (display only; not used by ranking or tests)",
    ).write(man_path)
    return manifest


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description="3D coordinates per ranked drug (evidence/molecules/)")
    ap.add_argument("--processed", default=str(PROCESSED))
    ap.add_argument("--ranking", default=PRIMARY_RANKING)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--limit", type=int, default=None, help="first N drugs only (smoke runs)")
    args = ap.parse_args(argv)
    m = build_molecules(Path(args.processed), args.ranking, args.seed, args.workers, args.limit)
    print(
        f"molecules: {m['n_generated']} generated, {m['n_failed']} failed, "
        f"{m['n_no_smiles']} without SMILES (of {m['n_drugs']})"
    )
    for pid, err in list(m["failed"].items())[:20]:
        print(f"  failed {pid}: {err}")
    return m


if __name__ == "__main__":
    main()
