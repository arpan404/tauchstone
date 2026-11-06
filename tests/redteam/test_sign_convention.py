"""Check 6 — sign-convention red team.

(a) GSE132903 main signature is AD minus control: GFAP/CD44/SERPINA3 up,
    SST/VGF/NPTX2/BDNF down (>= 5/7 must match).
(b) A fake drug z-vector equal to minus the landmark query stats must score
    strongly negative (reversal) on wtcs, ks and cosine; plus must score
    strongly positive. A sign flip anywhere in the pipeline would fail this.
(c) The API's pool-rank-1 consensus equals the ranking file's consensus_median.
"""

from __future__ import annotations

import duckdb
import numpy as np
from app.deps import get_repository
from app.main import app
from app.services.repository import ParquetRepository
from fastapi.testclient import TestClient

from pipelines.lincs.scoring import Scorer, build_query_sets
from tests.leakage._paths import MAIN_SIGNATURE, POOL, PROCESSED, needs_data, require

pytestmark = needs_data

EXPECTED_UP = {"GFAP", "CD44", "SERPINA3"}
EXPECTED_DOWN = {"SST", "VGF", "NPTX2", "BDNF"}


@needs_data
def test_signature_direction_sign_check() -> None:
    require(MAIN_SIGNATURE)
    con = duckdb.connect()
    try:
        rows = con.execute(
            "SELECT symbol, stat FROM read_parquet(?) WHERE symbol IN "
            "('GFAP','CD44','SERPINA3','SST','VGF','NPTX2','BDNF')",
            [str(PROCESSED / MAIN_SIGNATURE)],
        ).fetchdf()
    finally:
        con.close()
    got = dict(zip(rows["symbol"].tolist(), rows["stat"].tolist(), strict=True))
    assert EXPECTED_UP | EXPECTED_DOWN <= set(got), f"sign-check genes missing: {set(got)}"
    matches = sum(got[s] > 0 for s in EXPECTED_UP) + sum(got[s] < 0 for s in EXPECTED_DOWN)
    assert matches >= 5, f"only {matches}/7 sign-check genes match AD-minus-control"


@needs_data
def test_fake_drug_reversal_sign() -> None:
    require(MAIN_SIGNATURE, "lincs/landmark_order.parquet")
    con = duckdb.connect()
    try:
        query = con.execute(
            "SELECT entrez_id, stat, fdr, p_value FROM read_parquet(?)",
            [str(PROCESSED / MAIN_SIGNATURE)],
        ).fetchdf()
        landmark = con.execute(
            "SELECT entrez_id FROM read_parquet(?) ORDER BY col",
            [str(PROCESSED / "lincs/landmark_order.parquet")],
        ).fetchdf()["entrez_id"].astype(str).tolist()
    finally:
        con.close()
    sets = build_query_sets(query, landmark)
    assert not sets.fdr_fallback and sets.n_up == 150 and sets.n_down == 150
    for sign, want_negative in ((-1.0, True), (1.0, False)):
        scorer = Scorer.from_landmark_matrix(np.tile(sign * sets.query_vector, (4, 1)))
        raw = scorer.score_raw(sets)
        for method in ("wtcs", "ks", "cosine"):
            v = float(raw[method][0])
            if want_negative:
                assert v < -0.3, f"fake reversal drug: {method}={v} (sign flip?)"
            else:
                assert v > 0.3, f"fake mimicry drug: {method}={v} (sign flip?)"


@needs_data
def test_api_rank1_consensus_matches_ranking_file() -> None:
    require(POOL)
    repo = ParquetRepository(PROCESSED)
    app.dependency_overrides[get_repository] = lambda: repo
    try:
        body = TestClient(app).get("/candidates", params={"limit": 50}).json()
    finally:
        app.dependency_overrides.clear()
    rank1 = next(c for c in body["candidates"] if c["rank"] == 1)
    con = duckdb.connect()
    try:
        file_val = con.execute(
            "SELECT consensus_median FROM read_parquet(?) WHERE pool_rank = 1",
            [str(PROCESSED / POOL)],
        ).fetchall()[0][0]
    finally:
        con.close()
    assert rank1["consensus"] == file_val
    assert rank1["consensus"] < 0, "rank 1 must reverse the AD signature"
