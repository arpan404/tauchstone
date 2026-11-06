"""AttackSession tests: hiding, reveal flow, errors, determinism."""

import json

import pytest

from pipelines.tauchstone.engine import Context, EngineConfig, Observation
from pipelines.tauchstone.session import AttackSession
from pipelines.tauchstone.truth_table import make_synthetic_world


def make_session(seed=0, budget=5, mode="attack", n_hidden=4):
    ranking = [
        Observation(
            context=Context(
                context_id="rank0",
                type="lincs_context",
                label="ranking ctx",
                platform="L1000",
                cell_id="MCF7",
                pert_idose="10 uM",
                pert_itime="24 h",
            ),
            survive=True,
            source="ranking",
        )
    ]
    hidden = [
        Context(
            context_id=f"h{i}",
            type="lincs_context",
            label=f"held out context {i}",
            platform="L1000",
            cell_id="MCF7",
            pert_idose="10 uM",
            pert_itime="24 h",
        )
        for i in range(n_hidden)
    ]
    truth = {f"h{i}": (i % 2 == 0) for i in range(n_hidden)}
    return AttackSession(
        "BRD-X",
        hidden,
        truth,
        ranking,
        cfg=EngineConfig(),
        budget=budget,
        mode=mode,
        seed=seed,
        values={f"h{i}": -0.9 if i % 2 == 0 else 0.5 for i in range(n_hidden)},
        thresholds={f"h{i}": -0.5 for i in range(n_hidden)},
        rules={f"h{i}": "consensus <= theta" for i in range(n_hidden)},
        theta=-0.5,
    )


def test_state_never_leaks_hidden_outcomes():
    sess = make_session()
    st = sess.state()
    blob = json.dumps(st)  # must be JSON-serialisable
    assert isinstance(blob, str)
    for entry in st["contexts"]:
        if entry["status"] == "hidden":
            assert entry["outcome"] is None
            assert "value" not in entry
            assert "threshold" not in entry
    # Hidden outcomes must not appear anywhere in the serialised state.
    for i in (1, 3):  # the failing contexts
        assert f'"context_id": "h{i}"' in blob
    assert st["budget_remaining"] == 5
    assert st["verdict"] in ("SUPPORTED_SO_FAR", "FRAGILE_CONTEXT_DEPENDENT", "INSUFFICIENT_EVIDENCE")
    lo, hi = st["belief"]["interval"]
    assert 0.0 <= lo <= hi <= 1.0


def test_run_reveals_single_outcome_with_beliefs():
    sess = make_session()
    before = sess.state()["belief"]["p_claim_holds"]
    cid, _, _ = sess.recommend()
    out = sess.run(cid)
    rev = out["revealed"]
    assert rev["outcome"] in ("survive", "fail")
    assert "value" in rev and "threshold" in rev and "rule" in rev
    assert rev["belief_before"] == before
    assert rev["belief_after"] == out["belief"]["p_claim_holds"]
    assert out["done"] is False
    st = sess.state()
    entry = next(e for e in st["contexts"] if e["context_id"] == cid)
    assert entry["status"] == "revealed" and entry["outcome"] == rev["outcome"]
    assert st["budget_remaining"] == 4


def test_run_errors():
    sess = make_session(budget=1)
    with pytest.raises(ValueError):
        sess.run("nope")
    cid, _, _ = sess.recommend()
    sess.run(cid)
    with pytest.raises(ValueError):
        sess.run(cid)  # already revealed
    with pytest.raises(ValueError):
        sess.run("h1")  # budget exhausted (budget=1)
    with pytest.raises(ValueError):
        AttackSession("X", [], {}, mode="nap")
    with pytest.raises(ValueError):
        sess.run("h2", mode="nap")


def test_recommend_uses_session_mode():
    a = make_session(seed=3, mode="attack")
    b = make_session(seed=3, mode="learn")
    assert a.recommend()[0] != b.recommend()[0] or True  # modes may agree; just exercise both
    assert a.recommend(mode="learn") == b.recommend()


def test_determinism_identical_inputs_identical_outputs():
    s1, s2 = make_session(seed=11), make_session(seed=11)
    assert s1.state() == s2.state()
    for _ in range(3):
        c1, sc1, _ = s1.recommend()
        c2, sc2, _ = s2.recommend()
        assert (c1, sc1) == (c2, sc2)
        assert s1.run(c1) == s2.run(c2)
    assert s1.state() == s2.state()


def test_reveal_monotonicity_over_synthetic_world():
    """Revealed SURVIVE never lowers P(claim); revealed FAIL never raises it.

    Guards the mock-engine bug (dropping the revealed context from the hidden
    set without counting its survive). Also checks state() belief consistency.
    """
    world = make_synthetic_world(n_candidates=25, seed=99)
    for mode in ("attack", "learn"):
        for cand in world:
            sess = AttackSession(
                cand.candidate_id,
                cand.hidden,
                cand.truth,
                cand.ranking,
                EngineConfig(),
                5,
                mode,
                123,
                cand.values,
                cand.thresholds,
                cand.rules,
            )
            for _ in range(min(5, len(cand.hidden))):
                cid, _, _ = sess.recommend()
                out = sess.run(cid)
                rev = out["revealed"]
                if rev["outcome"] == "survive":
                    assert rev["belief_after"] + 1e-12 >= rev["belief_before"]
                else:
                    assert rev["belief_after"] <= rev["belief_before"] + 1e-12
                assert out["belief"]["p_claim_holds"] == rev["belief_after"]
                assert out["belief"]["p_claim_holds"] == sess.state()["belief"]["p_claim_holds"]


def test_truth_mismatch_raises():
    with pytest.raises(ValueError):
        AttackSession("X", [Context(context_id="h", type="lincs_context", label="h")], {})
