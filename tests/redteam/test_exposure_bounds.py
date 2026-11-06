"""Check 9 — brain-exposure plausibility screen for pool drugs.

Every measured exposure row for benchmark+development pool drugs is checked
against physical bounds. Hard-unphysical values fail; advisory oddities
(CSF ratio > 1, nonstandard units) are checked against the reviewed flag set.

Leak hygiene: per-drug measured values feed the hidden brain_exposure contexts,
so reports and test output carry only aggregates and minimal assay facts.
"""

from __future__ import annotations

import duckdb

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
    bad: list[str] = []
    for row in got.itertuples():
        v = float(row.value)
        if row.measure == "kp" and v > 50:
            bad.append("Kp outside physical bounds")
        if row.measure == "pampa_pe" and not (1e-8 <= v <= 1e-3):
            bad.append("Pe outside physical bounds")
    assert not bad, "unphysical exposure values:\n" + "\n".join(bad)


def test_measured_exposure_advisory_flags() -> None:
    """Reviewed assay oddities are allowed; any new flag needs review.

    ChEMBL 37: CHEMBL1798468 is human CSF/plasma ratio;
    CHEMBL1016182 is rhesus CSF drug uptake in percent. See QA report.
    """
    got = _pool_measured()
    flags = set()
    for row in got.itertuples():
        if row.measure != "csf":
            continue
        if str(row.unit) == "ratio" and float(row.value) > 1:
            flags.add((row.pert_id, row.level, row.unit))
        if str(row.unit) not in ("ratio", "uM", "nM", "ng ml-1", "ug ml-1"):
            flags.add((row.pert_id, row.level, row.unit))
    assert flags == {
        ("BRD-K04412738", "measured_human_cns", "ratio"),
        ("BRD-K92723993", "measured_preclinical", "%"),
    }, "Exposure advisory set changed; review assay/matrix without printing measured values"
