"""Unit tests for pipelines.lincs.scoring (spec 9). Synthetic, fast."""

import numpy as np
import pandas as pd
import pytest

from pipelines.lincs.scoring import (
    Scorer,
    build_query_sets,
    build_query_sets_no_fdr,
    cosine_block,
    es_weighted_block,
    ks_lamb_block,
    opposite_sign_combine,
    standardize,
)

N = 400
N_SIGS = 600
SEED = 7


def _toy_query(n_pos=150, n_neg=150):
    rng = np.random.default_rng(SEED)
    entrez = [str(1000 + i) for i in range(N)]
    stat = rng.normal(size=N)
    stat[:n_pos] = 2 + rng.random(n_pos)  # up block
    stat[n_pos:n_pos + n_neg] = -2 - rng.random(n_neg)  # down block
    fdr = np.full(N, 0.5)
    fdr[:n_pos] = 0.001
    fdr[n_pos:n_pos + n_neg] = 0.001
    p = np.full(N, 0.5)
    p[: n_pos + n_neg] = 0.001
    return pd.DataFrame({"entrez_id": entrez, "stat": stat, "fdr": fdr, "p_value": p})


def _toy_X(query_sets_vec, n_sigs=N_SIGS, seed=SEED):
    """Background random drugs + exact-negative + identical + random rows appended."""
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n_sigs, N)).astype(np.float64)
    y = query_sets_vec
    X = np.vstack([X, (-y * 3.0), (y * 3.0), rng.normal(size=N)])
    return X


def _scorer_for(q, seed=SEED):
    sets = build_query_sets(q, [str(1000 + i) for i in range(N)])
    X = _toy_X(q["stat"].to_numpy(), seed=seed)
    return Scorer.from_landmark_matrix(X), sets


def test_exact_negative_reverses_all_three():
    q = _toy_query()
    scorer, sets = _scorer_for(q)
    out = scorer.score(sets)
    for k in ("z_wtcs", "z_ks", "z_cosine", "consensus"):
        assert out[k][-3] < -3, k  # exact-negative row


def test_identical_mimics_all_three_positive():
    q = _toy_query()
    scorer, sets = _scorer_for(q)
    out = scorer.score(sets)
    for k in ("z_wtcs", "z_ks", "z_cosine", "consensus"):
        assert out[k][-2] > 3, k  # identical row


def test_random_drug_near_zero():
    q = _toy_query()
    scorer, sets = _scorer_for(q)
    out = scorer.score(sets)
    assert abs(out["consensus"][-1]) < 3


def test_opposite_sign_rule_including_zero():
    up = np.array([0.8, -0.5, 0.0, 0.3])
    down = np.array([-0.6, 0.4, 0.2, 0.0])
    got = opposite_sign_combine(up, down)
    assert got[0] == pytest.approx((0.8 - -0.6) / 2)
    assert got[1] == pytest.approx((-0.5 - 0.4) / 2)
    assert got[2] == 0.0  # either ES exactly 0 -> 0
    assert got[3] == 0.0  # same sign -> 0


def _slow_weighted_es(row, S, N):
    order = np.argsort(-row, kind="stable")
    v = row[order]
    hit = np.isin(order, list(S))
    w = np.abs(v) * hit
    if w.sum() == 0:
        return 0.0
    phit = np.cumsum(w) / w.sum()
    pmiss = np.cumsum(~hit) / (N - len(S))
    dev = phit - pmiss
    return float(dev[np.argmax(np.abs(dev))])


def test_weighted_es_matches_slow_reference():
    rng = np.random.default_rng(11)
    B, N_ = 25, 60
    Xb = rng.normal(size=(B, N_))
    order = np.argsort(-Xb, axis=1, kind="stable")
    S = np.array([3, 7, 42, 59])
    got = es_weighted_block(Xb, order, S, N_)
    for i in range(B):
        assert got[i] == pytest.approx(_slow_weighted_es(Xb[i], S, N_))


def _slow_lamb_ks(row, S, N):
    order = np.argsort(-row, kind="stable")
    rank = np.empty(N, dtype=int)
    rank[order] = np.arange(N)
    V = np.sort(rank[list(S)]) + 1.0
    t = len(S)
    j = np.arange(1, t + 1)
    a = np.max(j / t - V / N)
    b = np.max(V / N - (j - 1) / t)
    return a if a > b else -b


def test_lamb_ks_matches_slow_reference():
    rng = np.random.default_rng(13)
    B, N_ = 25, 60
    Xb = rng.normal(size=(B, N_))
    order = np.argsort(-Xb, axis=1, kind="stable")
    rank = np.empty_like(order)
    rank[np.arange(B)[:, None], order] = np.arange(N_)[None, :]
    S = np.array([0, 5, 30])
    got = ks_lamb_block(rank, S, N_)
    for i in range(B):
        assert got[i] == pytest.approx(_slow_lamb_ks(Xb[i], S, N_))


def test_standardisation_uses_ranking_rows_only():
    rng = np.random.default_rng(17)
    x = rng.normal(size=1000)
    mask = np.zeros(1000, dtype=bool)
    mask[:700] = True
    z1 = standardize(x, mask)
    x2 = x.copy()
    x2[800] = 1e6  # perturb a held-out score
    z2 = standardize(x2, mask)
    np.testing.assert_allclose(z1[:700], z2[:700])  # ranking rows unchanged
    assert z1.mean() != pytest.approx(0) or True  # mean over all rows need not be 0
    np.testing.assert_allclose(z1[mask].mean(), 0, atol=1e-12)
    np.testing.assert_allclose(z1[mask].std(), 1, atol=1e-12)


def test_block_size_invariance():
    q = _toy_query()
    sets = build_query_sets(q, [str(1000 + i) for i in range(N)])
    X = _toy_X(q["stat"].to_numpy())
    a = Scorer.from_landmark_matrix(X, block=64).score_raw(sets)
    b = Scorer.from_landmark_matrix(X, block=100_000).score_raw(sets)
    for k in a:
        np.testing.assert_allclose(a[k], b[k], rtol=1e-12, atol=1e-12)


def test_query_set_tiebreak_and_fallback():
    entrez = [str(1000 + i) for i in range(10)]
    df = pd.DataFrame({"entrez_id": entrez, "stat": [1.0] * 10,
                       "fdr": [0.001] * 10, "p_value": [0.5 - 0.01 * i for i in range(10)]})
    sets = build_query_sets(df, entrez, set_size=3)
    assert sets.fdr_fallback  # down set empty -> fallback
    # tie on stat -> smaller p_value first -> highest entrez last index first? p decreases with i
    assert list(sets.up_idx) == [9, 8, 7]


def test_no_fdr_rule_matches_fallback_selection():
    q = _toy_query()
    q["fdr"] = 0.5  # nothing passes: build_query_sets must take the fallback path
    land = [str(1000 + i) for i in range(N)]
    a = build_query_sets(q, land)
    assert a.fdr_fallback
    b = build_query_sets_no_fdr(q[["entrez_id", "stat", "p_value"]], land)
    assert b.fdr_fallback and b.up_n_fdr == -1
    assert set(a.up_idx) == set(b.up_idx) and set(a.down_idx) == set(b.down_idx)


def test_cosine_zero_norm_guard():
    Xb = np.zeros((3, 5))
    y = np.ones(5)
    got = cosine_block(Xb, y, float(np.sqrt(5)), np.zeros(3))
    np.testing.assert_array_equal(got, np.zeros(3))
