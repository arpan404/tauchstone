"""End-to-end output, provenance, and explicit failure statuses on synthetic data."""
from __future__ import annotations

import json

import httpx
import pandas as pd
import pytest

from pipelines.common.provenance import sha256_file
from pipelines.resources import perturbseqr
from pipelines.resources.collect import COLUMNS, run


@pytest.mark.parametrize("unavailable", [False, True])
def test_collect_report_only_outputs_and_failure_status(tmp_path, monkeypatch, unavailable):
    processed = tmp_path / "processed"
    files = {
        "signatures/GSE132903__main.parquet": pd.DataFrame({
            "entrez_id": ["1", "2", "3"], "symbol": ["GFAP", "SST", "VGF"],
            "stat": [2., -2., -1.], "fdr": [.01] * 3}),
        "lincs/landmark_order.parquet": pd.DataFrame({"col": [0, 1, 2], "entrez_id": ["1", "2", "3"]}),
        "lincs/genes.parquet": pd.DataFrame({"entrez_id": ["1", "2", "3"], "symbol": ["GFAP", "SST", "VGF"]}),
        "scores/GSE132903__main__candidate_pool.parquet": pd.DataFrame({
            "pert_id": ["A"], "pert_iname": ["test-drug"], "drug_name": ["TEST DRUG"],
            "pool_rank": [1], "consensus_median": [-2.]}),
    }
    for name, frame in files.items():
        path = processed / name
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.to_parquet(path, index=False)
    hashes = {name: sha256_file(processed / name) for name in files}
    monkeypatch.delenv("TS_CLUE_API_KEY", raising=False)

    def fetch(up, down, cache):
        assert up == ["GFAP"]
        assert down == ["SST", "VGF"]
        if unavailable:
            raise httpx.ConnectError("resource unreachable")
        cache.fetched_at.append("2026-11-07T00:00:00Z")
        return [{"name": "testdrug", "rank": 4, "score": .02, "libraries": ["SciPlex"]}]

    monkeypatch.setattr(perturbseqr, "fetch", fetch)
    report = tmp_path / "report.md"
    frame = run(tmp_path, report)
    assert list(frame.columns) == COLUMNS
    assert frame.status.tolist() == ["available", "not_available" if unavailable else "available", "needs_key"]
    output = processed / "resources/agreement.parquet"
    provenance = json.loads(output.with_name(output.name + ".provenance.json").read_text())
    assert provenance["output_sha256"] == sha256_file(output)
    assert provenance["random_seed"] is None
    assert provenance["validation_context"] == "not preregistered; report-only"
    assert all(sha256_file(processed / name) == checksum for name, checksum in hashes.items())
    assert "not preregistered; report-only" in report.read_text()
