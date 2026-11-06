"""ParquetRepository tested against tiny Parquet files written to a tmp dir."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest
from app.schemas.models import Benchmark, CandidateList, EvidenceCard, Signature
from app.services.repository import NotFoundError, ParquetRepository


def _write(df: pd.DataFrame, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)


@pytest.fixture()
def processed(tmp_path: Path) -> Path:
    base = tmp_path / "processed"
    _write(pd.DataFrame([
        {"entrez_id": "2532", "symbol": "GFAP", "log2fc": 1.1, "stat": 3.2,
         "p_value": 1e-4, "fdr": 0.001, "mean_expr": 8.0, "method": "limma"},
        {"entrez_id": "1746", "symbol": "DLG4", "log2fc": -0.9, "stat": -2.9,
         "p_value": 2e-4, "fdr": 0.002, "mean_expr": 7.0, "method": "limma"},
        {"entrez_id": "1234", "symbol": "FLAT", "log2fc": 0.01, "stat": 0.1,
         "p_value": 0.9, "fdr": 0.99, "mean_expr": 5.0, "method": "limma"},
    ]), base / "signatures" / "GSE132903__main.parquet")
    _write(pd.DataFrame([
        {"sample_id": "s1", "group": "AD", "included": True},
        {"sample_id": "s2", "group": "control", "included": True},
        {"sample_id": "s3", "group": "AD", "included": False},
    ]), base / "signatures" / "GSE132903__samples.parquet")
    _write(pd.DataFrame([
        {"rank": 1, "pert_id": "BRD-1", "pert_iname": "Tiny drug",
         "consensus_median": -2.0, "consensus_q25": -2.2, "consensus_q75": -1.8,
         "n_ranking_contexts": 4, "n_held_out_contexts": 2,
         "z_wtcs_median": -1.9, "z_ks_median": -2.0, "z_cosine_median": -2.1},
    ]), base / "scores" / "GSE132903__main__compound_ranking.parquet")
    _write(pd.DataFrame([
        {"pert_id": "BRD-1", "context_id": "MCF7|10 uM|24 h", "split": "ranking",
         "cell_id": "MCF7", "pert_idose": "10 uM", "pert_itime": "24 h", "consensus": -2.0,
         "z_wtcs": -1.9, "z_ks": -2.0, "z_cosine": -2.1},
        {"pert_id": "BRD-1", "context_id": "A549|10 uM|24 h", "split": "held_out",
         "cell_id": "A549", "pert_idose": "10 uM", "pert_itime": "24 h", "consensus": -0.1,
         "z_wtcs": -0.1, "z_ks": -0.1, "z_cosine": -0.1},
    ]), base / "scores" / "GSE132903__main__context_scores.parquet")
    _write(pd.DataFrame([
        {"pert_id": "BRD-1", "real_score": -2.0, "p_perm": 0.01},
    ]), base / "scores" / "GSE132903__main__permutation_summary.parquet")
    _write(pd.DataFrame([
        {"pert_id": "BRD-1", "chembl_id": "CHEMBL1", "target_symbol": "T1",
         "uniprot": "P1", "entrez_id": "111", "ensembl_id": "ENSG1",
         "action_type": "INHIBITOR", "mechanism": "inhibits T1",
         "source_url": "https://example.com/t"},
    ]), base / "evidence" / "targets.parquet")
    _write(pd.DataFrame([
        {"entrez_id": "111", "context": "cerebral cortex", "kind": "region",
         "ntpm": 5.0, "source_url": "https://example.com/hpa"},
    ]), base / "evidence" / "brain_expression.parquet")
    _write(pd.DataFrame([
        {"ensembl_id": "ENSG1", "entrez_id": "111", "score": 0.8,
         "datatype_scores": "{}", "source_url": "https://example.com/ot"},
    ]), base / "evidence" / "ad_association.parquet")
    _write(pd.DataFrame([
        {"pert_id": "BRD-1", "chembl_id": "CHEMBL1", "max_phase": 4.0,
         "status": "approved", "source_url": "https://example.com/c"},
    ]), base / "evidence" / "approval.parquet")
    _write(pd.DataFrame([
        {"pert_id": "BRD-1", "level": "predicted", "measure": "predicted_mpo",
         "value": 4.5, "unit": "score", "is_measured": False,
         "summary": "predicted pass", "source_url": "https://example.com/e"},
        {"pert_id": "BRD-1", "level": "measured_preclinical", "measure": "kp",
         "value": 0.5, "unit": "ratio", "is_measured": True,
         "summary": "Kp 0.5 (hidden)", "source_url": "https://example.com/e2"},
    ]), base / "evidence" / "exposure.parquet")
    _write(pd.DataFrame([
        {"uniprot": "P1", "pdb_id": "1ABC", "method": "X-ray",
         "resolution_angstrom": 2.0, "local_path": "/structures/1ABC.cif"},
    ]), base / "evidence" / "structures.parquet")
    _write(pd.DataFrame([
        {"candidate_id": "BRD-1", "context_id": "held_out_cohort:GSE173955",
         "context_type": "held_out_cohort", "label": "GSE173955", "value": -2.0,
         "threshold": -1.8, "outcome": "survive", "rule": "top-5% rule",
         "tissue": "brain", "region": "hippocampus", "platform": "RNA-seq TPM",
         "cell_id": None, "pert_idose": None, "pert_itime": None},
    ]), base / "tauchstone" / "truth_table.parquet")
    bench = {
        "n_candidates": 1, "n_seeds": 1, "budget": 5,
        "policies": [{
            "policy": "tauchstone_hybrid", "label": "Hybrid",
            "experiments_to_correct_verdict": {"median": 2.0, "iqr": [1.0, 3.0],
                                              "ci95": [1.0, 3.0]},
            "fragile_recall_at_3": {"estimate": 0.6, "ci95": [0.5, 0.7]},
            "fragile_recall_at_5": {"estimate": 0.8, "ci95": [0.7, 0.9]},
            "decision_accuracy": {"estimate": 0.85, "ci95": [0.8, 0.9]},
            "brier": 0.2}],
        "calibration": [{"bin_lo": 0.0, "bin_hi": 1.0, "mean_predicted": 0.5,
                         "observed_rate": 0.5, "n": 10}],
        "tests": [{"policy_a": "tauchstone_hybrid", "policy_b": "random",
                   "metric": "decision_accuracy", "statistic": 10.0, "p_holm": 0.01}],
        "preregistration_sha256": "abc", "provenance": {
            "dataset_accession": "T", "processing_version": "v", "git_commit": "c",
            "timestamp": "2026-11-06T00:00:00Z"},
    }
    (base / "tauchstone").mkdir(parents=True, exist_ok=True)
    (base / "tauchstone" / "benchmark_summary.json").write_text(json.dumps(bench))
    return base


def test_signature(processed):
    repo = ParquetRepository(processed)
    sig = Signature.model_validate(repo.get_signature("GSE132903", "main"))
    assert sig.n_ad == 1 and sig.n_control == 1  # from samples parquet, excluded dropped
    assert sig.sign_check and sig.sign_check[0].symbol == "GFAP"
    assert sig.sign_check[0].matches is True


def test_candidates_ranking_only(processed):
    repo = ParquetRepository(processed)
    cl = CandidateList.model_validate(repo.list_candidates(10))
    assert cl.n_ranked == 1
    cand = cl.candidates[0]
    assert cand.by_cell_line[0].cell_id == "MCF7"  # held-out A549 row excluded
    assert cand.is_demo_candidate is True


def test_evidence_hides_measured(processed):
    repo = ParquetRepository(processed)
    card = EvidenceCard.model_validate(repo.get_evidence("BRD-1"))
    assert card.brain_exposure.level == "predicted"
    assert card.structure and card.structure.pdb_id == "1ABC"
    assert card.structure.note.startswith("Target context only")
    with pytest.raises(NotFoundError):
        repo.get_evidence("BRD-NOPE")


def test_attack_world(processed):
    repo = ParquetRepository(processed)
    world = repo.get_attack_world("BRD-1")
    assert len(world.hidden) == 1
    assert world.hidden[0].context.cohort == "GSE173955"
    assert len(world.ranking) == 1  # ranking split only
    with pytest.raises(NotFoundError):
        repo.get_attack_world("BRD-NOPE")


def test_benchmark(processed, tmp_path):
    repo = ParquetRepository(processed)
    Benchmark.model_validate(repo.get_benchmark())
    empty = ParquetRepository(tmp_path)
    with pytest.raises(NotFoundError):
        empty.get_benchmark()
