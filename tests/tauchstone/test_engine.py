"""Engine unit tests: similarity, posterior, P(claim), verdicts, policies."""

import itertools
import math

import numpy as np
import pytest

from pipelines.tauchstone.engine import (
    MODE_TO_POLICY,
    POLICIES,
    Context,
    EngineConfig,
    Observation,
    acquisition,
    belief_interval,
    choose,
    p_claim,
    p_survive,
    similarity,
    verdict,
)


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


def cohort(cid, platform=None, region=None):
    return Context(context_id=cid, type="held_out_cohort", label=cid, platform=platform, region=region)


CFG = EngineConfig()


# -- similarity -------------------------------------------------------------
def test_similarity_different_type_is_point_one():
    assert similarity(lctx("a", cell="MCF7"), cohort("b", platform="x")) == 0.1


def test_similarity_lincs_full_match_caps_at_one():
    a = lctx("a", cell="MCF7", dose="10 uM", time="24 h")
    b = lctx("b", cell="MCF7", dose="10 uM", time="24 h")
    assert similarity(a, b) == pytest.approx(1.0)


def test_similarity_lincs_partial():
    a = lctx("a", cell="MCF7", dose="10 uM", time="24 h")
    assert similarity(a, lctx("b", cell="MCF7")) == pytest.approx(0.7)
    assert similarity(a, lctx("c", cell="A549", dose="10 uM", time="24 h")) == pytest.approx(0.7)
    assert similarity(a, lctx("d", cell="A549", dose="1 uM", time="6 h")) == pytest.approx(0.4)


def test_similarity_none_metadata_never_matches():
    a = lctx("a")  # all None
    b = lctx("b", cell="MCF7", dose="10 uM", time="24 h")
    assert similarity(a, b) == pytest.approx(0.4)


def test_similarity_cohort_pairs():
    a = cohort("a", platform="RNA-seq", region="cortex")
    assert similarity(a, cohort("b", platform="RNA-seq", region="cortex")) == pytest.approx(1.0)
    assert similarity(a, cohort("c", platform="RNA-seq", region="HIP")) == pytest.approx(0.7)
    assert similarity(a, cohort("d", platform="array", region="HIP")) == pytest.approx(0.4)


def test_similarity_brain_exposure_same_type_base_only():
    a = Context(context_id="a", type="brain_exposure", label="a")
    b = Context(context_id="b", type="brain_exposure", label="b")
    assert similarity(a, b) == pytest.approx(0.4)


# -- p_survive ---------------------------------------------------------------
def test_p_survive_matches_beta_formula_hand_computed():
    x = lctx("x", cell="MCF7", dose="10 uM", time="24 h")
    obs = [
        Observation(context=lctx("r1", cell="MCF7", dose="10 uM", time="24 h"), survive=True, source="ranking"),
        Observation(context=cohort("r2"), survive=False, source="ranking"),
        Observation(context=lctx("r3", cell="MCF7"), survive=True, source="revealed"),
    ]
    # w: 1.0 (survive, ranking), 0.1 (fail, ranking), 0.7 (survive, revealed).
    # alpha = 1 + 1.0 + 0.7 = 2.7 ; beta = 1 + 0.1 = 1.1 ; p = 2.7/3.8.
    assert p_survive(x, obs, CFG) == pytest.approx(2.7 / 3.8)


def test_p_survive_ranking_weight_cap():
    x = lctx("x", cell="MCF7", dose="10 uM", time="24 h")
    obs = [
        Observation(context=lctx(f"r{i}", cell="MCF7", dose="10 uM", time="24 h"), survive=True, source="ranking")
        for i in range(5)
    ]
    # Raw ranking weight 5.0 -> scaled by 4/5 -> effective 4.0.
    # alpha = 1 + 4 = 5, beta = 1 -> 5/6.
    assert p_survive(x, obs, CFG) == pytest.approx(5.0 / 6.0)


def test_p_survive_revealed_never_scaled():
    x = lctx("x", cell="MCF7", dose="10 uM", time="24 h")
    obs = [
        Observation(context=lctx(f"r{i}", cell="MCF7", dose="10 uM", time="24 h"), survive=True, source="ranking")
        for i in range(5)
    ] + [Observation(context=lctx("v", cell="MCF7"), survive=False, source="revealed")]
    # ranking 5.0 -> 4.0 survive; revealed w=0.7 fail -> beta += 0.7.
    # alpha = 5, beta = 1.7 -> 5/6.7.
    assert p_survive(x, obs, CFG) == pytest.approx(5.0 / 6.7)


def test_p_survive_uses_type_prior_and_default():
    cfg = EngineConfig(type_priors={"lincs_context": 0.9})
    assert p_survive(lctx("x"), [], cfg) == pytest.approx(0.9)
    assert p_survive(cohort("y"), [], cfg) == pytest.approx(0.5)  # unknown type -> 0.5


# -- P(claim) -----------------------------------------------------------------
def brute_poisson_sf(ps, need):
    total = 0.0
    for bits in itertools.product([0, 1], repeat=len(ps)):
        if sum(bits) >= need:
            pr = 1.0
            for b, p in zip(bits, ps, strict=True):
                pr *= p if b else (1.0 - p)
            total += pr
    return total


def test_p_claim_no_data_two_hidden():
    hidden = [lctx("h1"), lctx("h2")]
    # Prior p = 0.5 each; n_total=2 -> K* = ceil(1.4 - eps) = 2 -> 0.25.
    assert p_claim(hidden, [], 2, CFG) == pytest.approx(0.25)


def test_p_claim_matches_brute_force():
    x0 = lctx("x0", cell="MCF7", dose="10 uM", time="24 h")
    obs = [
        Observation(context=lctx("r1", cell="MCF7"), survive=True, source="ranking"),
        Observation(context=cohort("r2"), survive=False, source="revealed"),
    ]
    hidden = [lctx(f"h{i}", cell="MCF7" if i % 2 == 0 else "A549") for i in range(4)]
    for n_total, r_extra in [(4, 0), (6, 1)]:
        extra = [Observation(context=x0, survive=True, source="revealed")] * r_extra
        got = p_claim(hidden, obs + extra, n_total, CFG)
        ps2 = [p_survive(h, obs + extra, CFG) for h in hidden]
        r = r_extra  # obs holds one revealed FAIL (r=0); extras are survives
        need = math.ceil(0.7 * n_total - 1e-9) - r
        assert got == pytest.approx(brute_poisson_sf(ps2, need))


def test_p_claim_revealed_counted_from_source():
    x = lctx("x")
    obs = [Observation(context=lctx("r"), survive=True, source="revealed")]
    # n_total=2 -> K*=2, r=1 -> need 1 hidden survive; p_x = (1+0.4)/(2+0.4)=1.4/2.4.
    assert p_claim([x], obs, 2, CFG) == pytest.approx(1.4 / 2.4)


def test_p_claim_monotone_adding_survive_never_lowers():
    rng = np.random.default_rng(7)
    for _ in range(20):
        n_hidden = int(rng.integers(2, 6))
        hidden = [lctx(f"h{i}", cell=rng.choice(["MCF7", "A549"])) for i in range(n_hidden)]
        obs = [
            Observation(
                context=lctx(f"r{j}", cell=rng.choice(["MCF7", "A549"])),
                survive=bool(rng.integers(2)),
                source="ranking",
            )
            for j in range(3)
        ]
        n_total = n_hidden + int(rng.integers(0, 3))
        before = p_claim(hidden, obs, n_total, CFG)
        x = hidden[0]
        after = p_claim(
            hidden[1:], obs + [Observation(context=x, survive=True, source="revealed")], n_total, CFG
        )
        assert after + 1e-12 >= before


# -- verdict ------------------------------------------------------------------
def test_verdict_thresholds():
    assert verdict(0.8, CFG) == "SUPPORTED_SO_FAR"
    assert verdict(0.799, CFG) == "INSUFFICIENT_EVIDENCE"
    assert verdict(0.5, CFG) == "INSUFFICIENT_EVIDENCE"
    assert verdict(0.201, CFG) == "INSUFFICIENT_EVIDENCE"
    assert verdict(0.2, CFG) == "FRAGILE_CONTEXT_DEPENDENT"


# -- policies -------------------------------------------------------------------
def _policy_world():
    r_sup = lctx("r_sup", cell="MCF7", dose="10 uM", time="24 h")
    r_fail = lctx("r_fail", cell="A549", dose="1 uM", time="6 h")
    obs = [
        Observation(context=r_sup, survive=True, source="ranking"),
        Observation(context=r_fail, survive=False, source="ranking"),
    ]
    x_good = lctx("x_good", cell="MCF7", dose="10 uM", time="24 h")
    x_bad = lctx("x_bad", cell="A549", dose="1 uM", time="6 h")
    x_mid = Context(context_id="x_mid", type="brain_exposure", label="exposure")
    return obs, [x_good, x_bad, x_mid]


def test_each_policy_picks_expected_context():
    obs, hidden = _policy_world()
    rng = np.random.default_rng(0)
    n_total = 3
    scores = {p: acquisition(p, hidden, obs, n_total, CFG, rng) for p in POLICIES}
    assert max(scores["max_failure"], key=scores["max_failure"].get) == "x_bad"
    assert max(scores["greedy_strongest"], key=scores["greedy_strongest"].get) == "x_good"
    # x_mid has p = 0.5 exactly -> max uncertainty.
    assert max(scores["max_uncertainty"], key=scores["max_uncertainty"].get) == "x_mid"
    for p in POLICIES:
        if p != "random":
            assert set(scores[p]) == {"x_good", "x_bad", "x_mid"}


def test_learn_matches_brute_force():
    obs, hidden = _policy_world()
    n_total = 3
    base = p_claim(hidden, obs, n_total, CFG)
    expected = {}
    for x in hidden:
        px = p_survive(x, obs, CFG)
        rest = [h for h in hidden if h.context_id != x.context_id]
        tot = 0.0
        for y in (0, 1):
            hypo = Observation(context=x, survive=bool(y), source="revealed")
            tot += (px if y else 1 - px) * abs(p_claim(rest, obs + [hypo], n_total, CFG) - base)
        expected[x.context_id] = tot
    rng = np.random.default_rng(1)
    got = acquisition("expected_decision_change", hidden, obs, n_total, CFG, rng)
    for k, v in expected.items():
        assert got[k] == pytest.approx(v)


def test_hybrid_is_learn_plus_lambda_failure():
    obs, hidden = _policy_world()
    rng = np.random.default_rng(2)
    learn = acquisition("expected_decision_change", hidden, obs, 3, CFG, rng)
    hybrid = acquisition("tauchstone_hybrid", hidden, obs, 3, CFG, rng)
    for x in hidden:
        assert hybrid[x.context_id] == pytest.approx(
            learn[x.context_id] + CFG.lam * (1 - p_survive(x, obs, CFG))
        )


def test_random_deterministic_and_bounded():
    obs, hidden = _policy_world()
    s1 = acquisition("random", hidden, obs, 3, CFG, np.random.default_rng(42))
    s2 = acquisition("random", hidden, obs, 3, CFG, np.random.default_rng(42))
    assert s1 == s2
    assert all(0.0 <= v < 1.0 for v in s1.values())


def test_choose_tie_break_and_rationale():
    obs = [Observation(context=lctx("r"), survive=True, source="ranking")]
    hidden = [lctx("b_ctx"), lctx("a_ctx")]  # identical -> tie -> lower id wins
    cid, score, rationale = choose("max_failure", hidden, obs, 2, CFG, np.random.default_rng(0))
    assert cid == "a_ctx"
    assert isinstance(rationale, str) and rationale
    cid, _, rationale = choose("max_failure", [lctx("z1"), lctx("z2")], [], 2, CFG, np.random.default_rng(0))
    assert "break the claim" in rationale
    _, _, r2 = choose("greedy_strongest", [lctx("z1")], [], 1, CFG, np.random.default_rng(0))
    assert "support" in r2
    with pytest.raises(ValueError):
        choose("nope", hidden, obs, 2, CFG, np.random.default_rng(0))
    with pytest.raises(ValueError):
        choose("max_failure", [], obs, 0, CFG, np.random.default_rng(0))


def test_mode_to_policy_mapping():
    assert MODE_TO_POLICY == {"attack": "max_failure", "learn": "expected_decision_change"}


def test_belief_interval():
    lo, hi = belief_interval([0.1, 0.5, 0.9])
    assert lo <= hi
    assert belief_interval([0.7, 0.7]) == (pytest.approx(0.7), pytest.approx(0.7))
    with pytest.raises(ValueError):
        belief_interval([])
