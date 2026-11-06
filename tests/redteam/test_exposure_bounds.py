"""Check 9 — brain-exposure plausibility screen for pool drugs.

Every measured exposure row for benchmark+development pool drugs is checked
against physical bounds. Hard-unphysical values fail; advisory oddities
(CSF ratio > 1, nonstandard units) are locked as xfail for the lead.

Leak hygiene: per-drug measured values feed the hidden brain_exposure contexts,
so the committed report carries only aggregates; the full table prints to CI
output (``pytest -s``) for the lead.
"""

from __future__ import annotations

import duckdb
import pytest

from tests.leakage._paths import EXPOSURE, POOL, PROCESSED, needs_data, require

pytestmark = needs_data


def _pool_measured():
    require(POOL, EXPOSURE)
    con = duckdb.connect()
    try:
        pool = con.execute(
            "SELECT pert_id FROM read_parquet(?) WHERE pool IN ('benchmark', 'development')",
            [str(PROCESSED / POOL)],
        ).fetchdf()
        exp = con.execute("SELECT * FROM read_parquet(?)", [str(PROCESSED / EXPOSURE)]).fetchdf()
    finally:
        con.close()
    pool_ids = set(pool["pert_id"].astype(str))
    got = exp[exp["pert_id"].astype(str).isin(pool_ids) & (exp["is_measured"].astype(str) == "True")]
    return got


def test_measured_exposure_physical_bounds() -> None:
    got = _pool_measured()
    print(f"\nmeasured exposure rows for pool drugs: {len(got)}")
    for row in got.itertuples():
        print(f"  {row.pert_id} {row.level} {row.measure} {row.value} {row.unit}")
    bad: list[str] = []
    for row in got.itertuples():
        v = float(row.value)
        if row.measure == "kp" and v > 50:
            bad.append(f"{row.pert_id}: Kp={v} > 50")
        if row.measure == "pampa_pe" and not (1e-8 <= v <= 1e-3):
            bad.append(f"{row.pert_id}: Pe={v} outside 1e-8..1e-3 cm/s")
    assert not bad, "unphysical exposure values:\n" + "\n".join(bad)


@pytest.mark.xfail(
    strict=True,
    reason="advisory exposure flags for the lead: CSF ratio > 1 and '%' CSF unit present; "
    "confirm assay/matrix before trusting those brain_exposure outcomes.",
)
def test_measured_exposure_advisory_flags() -> None:
    got = _pool_measured()
    flags: list[str] = []
    for row in got.itertuples():
        v = float(row.value)
        if row.measure == "csf" and str(row.unit) == "ratio" and v > 1:
            flags.append(f"{row.pert_id}: CSF ratio {v} > 1 (unusual without active influx)")
        if row.measure == "csf" and str(row.unit) not in ("ratio", "uM", "nM", "ng ml-1", "ug ml-1"):
            flags.append(f"{row.pert_id}: unexpected CSF unit {row.unit!r}")
    assert not flags, "advisory exposure flags:\n" + "\n".join(flags)
