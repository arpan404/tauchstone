"""POST /compounds/estimate: exploratory structure-only estimate of the discovery score.

Display only. The estimate comes from the random forest in pipelines/lincs/exploratory_model.py
(Morgan fingerprints of each SMILES -> GSE132903 consensus_median). It never feeds the ranking,
thresholds, the truth table or any hidden test, and it says nothing about Alzheimer's: at most
it guesses what LINCS would likely measure. On held-out scaffolds it is barely better than
predicting the training mean (MAE 0.472 vs 0.481, R2 0.023, Spearman 0.18).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.settings import settings

router = APIRouter()
log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = REPO_ROOT / "contracts/fixtures/estimateCompounds.json"
OUTPUT = "processed/models/exploratory"
COMPOUNDS = "processed/lincs/compounds.parquet"
ARTIFACTS = ("report.json", "predictions.parquet", "model.joblib")
STEP = "exploratory_structure_model"
HELD_OUT_SPLIT = "internal_test_scaffold"

Basis = Literal["held_out", "in_training", "new_structure"]
Status = Literal["stored", "computed", "no_structure", "invalid_structure", "unknown_id"]
CompoundId = Annotated[str, StringConstraints(min_length=1, max_length=64, strip_whitespace=True)]


class EstimateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[CompoundId] = Field(max_length=50)


class CompoundEstimate(BaseModel):
    id: str
    estimate: float | None
    basis: Basis | None
    measured: float | None
    status: Status
    run_id: str


class ModelNotReady(Exception):
    """Artifacts missing, still being written, or failing their checksum."""


@dataclass(frozen=True)
class Loaded:
    run_id: str
    # pert_id -> (stored prediction, split, discovery consensus_median)
    stored: dict
    model: Any
    out: Path


def _basis(split: str) -> Basis:
    return "held_out" if split == HELD_OUT_SPLIT else "in_training"


def _stamp(out: Path) -> tuple:
    """Cheap identity of the artifact set; a retrain changes it and drops the cache."""
    stamp = []
    for name in ARTIFACTS:
        for path in (out / name, out / f"{name}.provenance.json"):
            if not path.is_file():
                raise ModelNotReady("Exploratory model is not trained.")
            st = path.stat()
            stamp.append((path.name, st.st_mtime_ns, st.st_size))
    return tuple(stamp)


def _verify(out: Path) -> dict:
    """Same rule as predict_candidate: every artifact must match its provenance sidecar
    before anything is read. All three must also come from one training run."""
    from pipelines.common.provenance import sha256_file

    stamps = set()
    for name in ARTIFACTS:
        record = json.loads((out / f"{name}.provenance.json").read_text())
        if record.get("step") != STEP or sha256_file(out / name) != record.get("output_sha256"):
            raise ModelNotReady("Local artifact checksum mismatch.")
        stamps.add(record.get("timestamp"))
    report = json.loads((out / "report.json").read_text())
    if len(stamps) != 1 or report.get("provenance", {}).get("timestamp") not in stamps:
        raise ModelNotReady("Artifacts come from different training runs.")
    return report


@lru_cache(maxsize=2)
def _load(out_dir: str, stamp: tuple) -> Loaded:
    import joblib
    import pandas as pd

    out = Path(out_dir)
    report = _verify(out)
    rows = pd.read_parquet(out / "predictions.parquet", columns=["pert_id", "split", "predicted", "consensus_median"])
    stored = {
        str(pid): (float(pred), str(split), float(measured))
        for pid, split, pred, measured in rows.itertuples(index=False)
    }
    # Pickle is only loaded after its checksum matched the sidecar written at training time.
    model = joblib.load(out / "model.joblib")
    return Loaded(run_id=str(report["run_id"]), stored=stored, model=model, out=out)


def _generator():
    from rdkit.Chem import rdFingerprintGenerator

    from pipelines.lincs.exploratory_model import FEATURES

    return rdFingerprintGenerator.GetMorganGenerator(radius=FEATURES["radius"], fpSize=FEATURES["bits"])


@lru_cache(maxsize=2)
def _seen_fingerprints(out_dir: str, stamp: tuple) -> dict:
    """Fingerprint -> split for every structure in this run's predictions. A different
    pert_id with an identical fingerprint (salt, stereoisomer, duplicate) is not new to
    the model, so it is labelled by the split of the structure it matches."""
    import pandas as pd
    from rdkit import Chem

    gen = _generator()
    frame = pd.read_parquet(Path(out_dir) / "predictions.parquet", columns=["canonical_structure", "split"])
    seen: dict[bytes, str] = {}
    for smiles, split in frame.itertuples(index=False):
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            continue
        key = gen.GetFingerprintAsNumPy(mol).tobytes()
        # A fingerprint seen in training wins over a held-out copy.
        if seen.get(key) != "train":
            seen[key] = split
    return seen


@lru_cache(maxsize=2)
def _smiles(path: str, mtime_ns: int) -> dict:
    import pandas as pd

    frame = pd.read_parquet(path, columns=["pert_id", "canonical_smiles"])
    return {
        str(pid): s.strip()
        for pid, s in frame.itertuples(index=False)
        if isinstance(s, str) and s.strip()
    }


def estimate(data_dir: Path, ids: list[str]) -> list[dict]:
    out = Path(data_dir) / OUTPUT
    stamp = _stamp(out)
    loaded = _load(str(out), stamp)
    compounds = Path(data_dir) / COMPOUNDS
    smiles = _smiles(str(compounds), compounds.stat().st_mtime_ns) if compounds.is_file() else {}

    results: list[dict] = []
    fresh: list[tuple[int, bytes, Any]] = []
    for pid in ids:
        row = {"id": pid, "estimate": None, "basis": None, "measured": None, "run_id": loaded.run_id}
        if pid in loaded.stored:
            predicted, split, measured = loaded.stored[pid]
            row |= {"estimate": predicted, "basis": _basis(split), "measured": measured, "status": "stored"}
        elif pid in smiles:
            from rdkit import Chem

            mol = Chem.MolFromSmiles(smiles[pid])
            if mol is None or mol.GetNumAtoms() == 0:
                row["status"] = "invalid_structure"
            else:
                fp = _generator().GetFingerprintAsNumPy(mol)
                fresh.append((len(results), fp.tobytes(), fp))
                row["status"] = "computed"
        else:
            # In LINCS without a SMILES, or not a LINCS id at all.
            row["status"] = "no_structure" if pid.startswith("BRD-") else "unknown_id"
        results.append(row)

    if fresh:
        import numpy as np

        seen = _seen_fingerprints(str(out), stamp)
        values = loaded.model.predict(np.vstack([fp for *_, fp in fresh]))
        for (i, key, _), value in zip(fresh, values, strict=True):
            split = seen.get(key)
            results[i] |= {"estimate": float(value), "basis": _basis(split) if split else "new_structure"}
    return results


def mock_estimate(ids: list[str]) -> list[dict]:
    fixture = json.loads(FIXTURE.read_text())
    rows = []
    for pid in ids:
        entry = fixture["estimates"].get(pid)
        base = {"id": pid, "run_id": fixture["run_id"]}
        if entry is None:
            rows.append(base | {"estimate": None, "basis": None, "measured": None, "status": "unknown_id"})
        else:
            rows.append(base | entry)
    return rows


@router.post(
    "/compounds/estimate",
    response_model=list[CompoundEstimate],
    tags=["exploratory lab"],
)
def estimate_compounds(body: EstimateRequest) -> list[dict]:
    if settings.mock:
        return mock_estimate(body.ids)
    from app.routes import lab

    if lab.training.get().get("status") == "training":
        raise HTTPException(409, "Exploratory model is training.")
    try:
        return estimate(settings.data_dir, body.ids)
    except ModelNotReady as exc:
        log.warning("Structure estimate unavailable: %s", exc)
        raise HTTPException(409, "Exploratory model is not ready.") from exc


# ---- Model comparison (GET /compounds/estimate/models) ----------------------------------------
# Read-only view of the stored structure model bake-off (pipelines/lincs/structure_bakeoff.py).
# Nothing is computed per request; the file must match its provenance sidecar.
COMPARISON = "processed/models/v2_candidates/comparison.json"
COMPARISON_FIXTURE = REPO_ROOT / "contracts/fixtures/getEstimateModels.json"


class EstimateModelRow(BaseModel):
    name: str
    label: str
    served: bool
    spearman: float
    mae: float
    baseline_mae: float
    r2: float | None
    spearman_vs_served: float | None
    spearman_vs_served_ci95: list[float] | None
    passes_rule: bool | None


class EstimateModels(BaseModel):
    served: str
    outcome: str
    n_test: int
    n_test_groups: int
    bootstrap: dict
    rule: str
    preregistered: bool
    models: list[EstimateModelRow]


def comparison_view(result: dict) -> dict:
    """Trim the stored comparison to what the page shows."""
    rows = []
    for row in result["models"]:
        diff = row.get("vs_served") or {}
        rows.append({"name": row["name"], "label": row["label"], "served": row["name"] == result["served"],
                     "spearman": row["spearman"], "mae": row["mae"], "baseline_mae": row["baseline_mae"],
                     "r2": row["r2"], "spearman_vs_served": diff.get("spearman"),
                     "spearman_vs_served_ci95": diff.get("spearman_ci95"), "passes_rule": row.get("passes_rule")})
    return {"served": result["served"], "outcome": result["outcome"],
            "n_test": result["test_set"]["n_compounds"], "n_test_groups": result["test_set"]["n_groups"],
            "bootstrap": result["bootstrap"], "rule": result["rule"],
            "preregistered": bool(result.get("preregistered", False)), "models": rows}


def load_comparison(data_dir: Path) -> dict:
    from pipelines.common.provenance import sha256_file

    path = Path(data_dir) / COMPARISON
    sidecar = path.with_name(path.name + ".provenance.json")
    if not path.is_file() or not sidecar.is_file():
        raise ModelNotReady("No stored model comparison.")
    if json.loads(sidecar.read_text()).get("output_sha256") != sha256_file(path):
        raise ModelNotReady("Model comparison checksum mismatch.")
    return comparison_view(json.loads(path.read_text()))


@router.get("/compounds/estimate/models", response_model=EstimateModels, tags=["exploratory lab"])
def estimate_models() -> dict:
    if settings.mock:
        return json.loads(COMPARISON_FIXTURE.read_text())
    try:
        return load_comparison(settings.data_dir)
    except ModelNotReady as exc:
        log.warning("Model comparison unavailable: %s", exc)
        raise HTTPException(404, "No stored model comparison.") from exc
