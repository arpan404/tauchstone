"""Known-check test on real processed data (Track D1 lookup). Skips without data."""

import pytest

from pipelines.evidence.lookup import lookup

pytestmark = pytest.mark.data

NAMES = ["donepezil", "memantine", "galantamine", "rivastigmine", "nepafenac", "lithium"]


def test_lookup_known_checks():
    try:
        rows = lookup(NAMES)
    except FileNotFoundError as e:
        pytest.skip(f"real data absent: {e}")
    by_query = {r["query"]: r for r in rows}
    assert [r["query"] for r in rows] == NAMES  # input order preserved

    donepezil = by_query["donepezil"]
    assert donepezil["status"] == "ranked"
    assert donepezil["pool_rank"] == 684
    assert donepezil["rank_total"] == 1816
    assert donepezil["consensus"] == pytest.approx(-0.24, abs=0.01)

    assert by_query["memantine"]["status"] == "ranked"
    assert by_query["memantine"]["pool_rank"] == 502

    assert by_query["galantamine"]["status"] == "ranked"
    assert by_query["galantamine"]["pool_rank"] == 1214

    rivastigmine = by_query["rivastigmine"]
    assert rivastigmine["status"] == "not_rankable"
    assert rivastigmine["drug_id"] is not None

    nepafenac = by_query["nepafenac"]
    assert nepafenac["status"] == "ranked"
    assert nepafenac["pool_rank"] == 2
    assert nepafenac["attack_ready"]
    assert nepafenac["preregistered"]

    lithium = by_query["lithium"]
    assert lithium["status"] == "not_in_lincs"
    assert lithium["drug_id"] is None
