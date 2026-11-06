"""Check 8 — known-positive sanity check (report, never tune).

Compounds commonly reported in prior AD connectivity-map repurposing screens
(HDAC inhibitors such as vorinostat, trichostatin A, valproic acid and
phenylbutyrate; resveratrol and curcumin are frequent literature hits) should
rank above the median of all ranked compounds. No citation is asserted beyond
'commonly reported'. This test only reports ranks; nothing may be tuned toward it.
"""

from __future__ import annotations

import duckdb

from tests.leakage._paths import MAIN_RANKING, PROCESSED, needs_data, require

pytestmark = needs_data

PROBES = [
    "vorinostat",
    "trichostatin-a",
    "valproic-acid",
    "phenylbutyrate",
    "resveratrol",
    "curcumin",
    "rapamycin",
    "wortmannin",
]


def test_known_positives_report() -> None:
    require(MAIN_RANKING)
    con = duckdb.connect()
    try:
        rank = con.execute(
            "SELECT rank, pert_id, pert_iname, consensus_median FROM read_parquet(?)",
            [str(PROCESSED / MAIN_RANKING)],
        ).fetchdf()
    finally:
        con.close()
    n = len(rank)
    median_rank = (n + 1) / 2
    print(f"\nranked compounds: {n}; median rank: {median_rank}")
    for probe in PROBES:
        hits = rank[rank["pert_iname"].str.lower() == probe].sort_values("rank")
        if hits.empty:
            print(f"  {probe}: NOT RANKED")
            continue
        for row in hits.itertuples():
            pct = 100 * row.rank / n
            side = "above median" if row.rank < median_rank else "BELOW MEDIAN"
            print(f"  {probe} ({row.pert_id}): rank {row.rank}/{n} (top {pct:.1f}%) {side}")
    best = {p: rank[rank["pert_iname"].str.lower() == p]["rank"].min() for p in PROBES}
    best = {p: v for p, v in best.items() if v == v}  # drop NaN (not ranked)
    assert best, "none of the probe compounds are ranked"
    above = sum(1 for v in best.values() if v < median_rank)
    # At least half of the probe compound *names* must have a form above the median.
    assert above >= len(best) / 2, f"only {above}/{len(best)} probe names above the median"
