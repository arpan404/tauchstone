"""Check 2 — theta comes from permutations only.

``theta_value`` in the frozen preregistration must equal the 25th percentile
recorded in the permutation-null provenance sidecar, and the provenance must
show a permutations-only computation (main signature in, 200 shuffles, gold
signatures, no truth table or held-out input). The per-compound p-values in
the summary are recomputed from the null to lock the chain.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import yaml

from tests.leakage._paths import GOLD_NULL, GOLD_SUMMARY, PROCESSED, needs_data, require

REPO = Path(__file__).resolve().parents[2]
PREREG = REPO / "data" / "manifests" / "preregistration.yaml"


@needs_data
def test_theta_matches_prereg_and_provenance() -> None:
    require(GOLD_NULL)
    prov_path = PROCESSED / (GOLD_NULL + ".provenance.json")
    assert prov_path.exists(), "permutation null must carry a provenance sidecar"
    prov = json.loads(prov_path.read_text())
    params = prov.get("parameters", {})
    prereg = yaml.safe_load(PREREG.read_text())
    assert prereg["status"] == "frozen"
    assert prereg["tauchstone_engine"]["theta_value"] == params["theta"]
    assert params["theta"] == params["theta_quantiles"]["p25"]
    assert params["theta_pct"] == 25.0
    # Permutations only: the only signature input is the primary one, 200 shuffles, gold set.
    assert str(params.get("signature", "")).endswith("signatures/GSE132903__main.parquet")
    assert params.get("n_perms") == 200
    assert params.get("gold_only") is True
    assert prov.get("random_seed") == 20261105
    assert params.get("standardisation") == "ranking-contexts-only"
    blob = json.dumps(prov).lower()
    for forbidden in ("truth_table", "held_out", "gse173955", "gse53697", "exposure"):
        assert forbidden not in blob, f"provenance references held-out input: {forbidden}"


@needs_data
def test_permutation_p_values_recompute_from_null() -> None:
    require(GOLD_NULL, GOLD_SUMMARY)
    con = duckdb.connect()
    try:
        null = con.execute(
            "SELECT perm_id, pert_id, consensus_median FROM read_parquet(?)",
            [str(PROCESSED / GOLD_NULL)],
        ).fetchdf()
        summ = con.execute(
            "SELECT pert_id, real_score, p_perm FROM read_parquet(?)", [str(PROCESSED / GOLD_SUMMARY)]
        ).fetchdf()
    finally:
        con.close()
    assert null["perm_id"].nunique() == 200
    n_perms = 200
    worst = 0.0
    for row in summ.itertuples():
        dist = null.loc[null["pert_id"] == row.pert_id, "consensus_median"].to_numpy()
        assert len(dist) == n_perms, f"{row.pert_id}: null has {len(dist)} perms, not 200"
        expected = (1 + (dist <= row.real_score).sum()) / (1 + n_perms)
        worst = max(worst, abs(expected - row.p_perm))
    assert worst == 0.0, f"summary p_perm does not recompute from the null (max diff {worst})"
