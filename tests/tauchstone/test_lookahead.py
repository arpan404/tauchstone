"""Experimental decision-lookahead policies: utility, brute-force agreement, divergence."""

import numpy as np
import pytest

from pipelines.tauchstone.engine import (
    CANDIDATE_POLICIES,
    POLICIES,
    Context,
    EngineConfig,
    Observation,
    acquisition,
    choose,
    decision_lookahead_scores,
    decision_utility,
    p_claim,
    p_survive,
    verdict,
)

CFG = EngineConfig()


def lctx(cid, cell=None, dose=None, time=None):
    return Context(
        context_id=cid,
        type="lincs_context",
        label=cid,
        platform="L1000",
        cell_id=cell,
        pert_idose=dose,
        pert_itime=time,
    )


def test_candidate_policies_kept_out_of_prereg_set():
    assert set(CANDIDATE_POLICIES) == {"decision_lookahead", "decision_lookahead_hybrid"}
    assert not (set(CANDIDATE_POLICIES) & set(POLICIES))
    with pytest.raises(ValueError):
        acquisition("decision_lookahead", [], [], 0, CFG, np.random.default_rng(0))
    with pytest.raises(ValueError):
        choose("decision_lookahead", [lctx("x")], [], 1, CFG, np.random.default_rng(0))


def test_decision_utility_cases():
    assert decision_utility(1.0, CFG) == 1.0
    assert decision_utility(0.85, CFG) == pytest.approx(0.85)
    assert decision_utility(0.8, CFG) == pytest.approx(0.8)
    assert decision_utility(0.79, CFG) == 0.0
    assert decision_utility(0.5, CFG) == 0.0
    assert decision_utility(0.21, CFG) == 0.0
    assert decision_utility(0.2, CFG) == pytest.approx(0.8)
    assert decision_utility(0.0, CFG) == 1.0


def _policy_world():
    obs = [
        Observation(context=lctx("r_sup", cell="MCF7", dose="10 uM", time="24 h"), survive=True, source="ranking"),
        Observation(context=lctx("r_fail", cell="A549", dose="1 uM", time="6 h"), survive=False, source="ranking"),
    ]
    hidden = [
        lctx("x_good", cell="MCF7", dose="10 uM", time="24 h"),
        lctx("x_bad", cell="A549", dose="1 uM", time="6 h"),
        Context(context_id="x_mid", type="brain_exposure", label="exposure"),
    ]
    return obs, hidden


def test_d1_matches_brute_force():
    """d=1 scores equal an independent E_y[U(after)] computation; hybrid adds lam*(1-p)."""
    obs, hidden = _policy_world()
    n_total = 3
    for lam in (0.0, CFG.lam):
        got, learn = decision_lookahead_scores(hidden, obs, n_total, CFG, budget_remaining=1, lam=lam)
        for x in hidden:
            px = p_survive(x, obs, CFG)
            rest = [h for h in hidden if h.context_id != x.context_id]
            exp = 0.0
            for y in (False, True):
                hypo = Observation(context=x, survive=y, source="revealed")
                after = p_claim(rest, [*obs, hypo], n_total, CFG)
                exp += (px if y else 1.0 - px) * decision_utility(after, CFG)
            assert got[x.context_id] == pytest.approx(exp + lam * (1.0 - px))
        # Tie-break column is the learn-mode score.
        assert set(learn) == {x.context_id for x in hidden}


def test_d2_dominates_d1_and_caches():
    """With budget for two steps, d=2 values are >= d=1 values (max over stopping early)."""
    obs, hidden = _policy_world()
    s1, _ = decision_lookahead_scores(hidden, obs, 3, CFG, budget_remaining=1)
    s2, _ = decision_lookahead_scores(hidden, obs, 3, CFG, budget_remaining=5)
    for cid in s1:
        assert s2[cid] + 1e-12 >= s1[cid]


def _divergence_world():
    hidden = [
        lctx("h0", cell="MCF7", dose="10 uM", time="24 h"),
        lctx("h1", cell="MCF7", dose="1 uM", time="6 h"),
        lctx("h2", cell="MCF7", dose="1 uM", time="24 h"),
        lctx("h3", cell="MCF7", dose="10 uM", time="24 h"),
    ]
    obs = [
        Observation(context=lctx("r0", cell="VCAP", dose="10 uM", time="6 h"), survive=True, source="ranking"),
        Observation(context=lctx("r1", cell="MCF7", dose="1 uM", time="6 h"), survive=False, source="ranking"),
        Observation(context=lctx("r2", cell="VCAP", dose="1 uM", time="24 h"), survive=False, source="ranking"),
    ]
    truth = {"h0": True, "h1": False, "h2": False, "h3": True}
    return hidden, obs, truth


def test_lookahead_picks_decisive_context_learn_picks_volatile():
    """h2's true outcome settles the claim (FRAGILE, correct); h0's leaves it INSUFFICIENT."""
    from pipelines.tauchstone.evaluation import full_information_verdict

    hidden, obs, truth = _divergence_world()
    n_total, full = 4, full_information_verdict(truth, CFG.q)
    assert full == "FRAGILE"
    learn_pick, _, _ = choose(
        "expected_decision_change", hidden, obs, n_total, CFG, np.random.default_rng(0)
    )
    assert learn_pick == "h0"
    for depth in (1, 5):
        la_pick, score, rationale = choose(
            "decision_lookahead", hidden, obs, n_total, CFG, np.random.default_rng(0),
            budget_remaining=depth,
        )
        assert la_pick == "h2"
        assert "decision utility" in rationale and f"{score:.3f}" in rationale
    # Revealing h2's true outcome is decisive and correct ...
    h2 = next(h for h in hidden if h.context_id == "h2")
    rest = [h for h in hidden if h.context_id != "h2"]
    pc = p_claim(rest, [*obs, Observation(context=h2, survive=False, source="revealed")], n_total, CFG)
    assert verdict(pc, CFG) == "FRAGILE_CONTEXT_DEPENDENT"
    # ... while learn's pick stays INSUFFICIENT on its true outcome.
    h0 = next(h for h in hidden if h.context_id == "h0")
    rest0 = [h for h in hidden if h.context_id != "h0"]
    pc0 = p_claim(rest0, [*obs, Observation(context=h0, survive=True, source="revealed")], n_total, CFG)
    assert verdict(pc0, CFG) == "INSUFFICIENT_EVIDENCE"


def test_all_zero_falls_back_to_learn_then_id():
    """No decisive outcome anywhere: all lookahead scores 0 -> learn order, then id."""
    hidden = [lctx("b"), lctx("a")]  # identical contexts
    obs = [Observation(context=lctx("r", cell="MCF7"), survive=True, source="ranking")]
    scores, learn = decision_lookahead_scores(hidden, obs, 2, CFG, budget_remaining=1)
    assert set(scores) == {"a", "b"}
    cid, _, _ = choose(
        "decision_lookahead", hidden, obs, 2, CFG, np.random.default_rng(0), budget_remaining=1
    )
    # Tie on (score, learn) -> lower context_id.
    assert learn["a"] == learn["b"]
    assert cid == "a"
