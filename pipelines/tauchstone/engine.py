"""Tauchstone engine: similarity-weighted Beta posterior, claim belief, verdicts, policies.

Implements contracts/algorithms.md section 4 exactly. All functions are pure
(no global state); randomness only enters through an explicit
``numpy.random.Generator``.

Sign convention: signatures are AD minus control; a drug reverses disease when
its score is negative. Here ``survive=True`` means the candidate survived one
validation context (its reversal held up); the claim is that it survives in at
least a fraction ``q`` of all hidden contexts.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

import numpy as np

POLICIES = (
    "random",
    "greedy_strongest",
    "max_failure",
    "max_uncertainty",
    "expected_decision_change",
    "tauchstone_hybrid",
    "decision_lookahead_hybrid",
)

#: Co-primary policies (prereg): each is tested against the five baselines.
CO_PRIMARY = ("tauchstone_hybrid", "decision_lookahead_hybrid")
BASELINES = tuple(p for p in POLICIES if p not in CO_PRIMARY)

MODE_TO_POLICY = {"attack": "max_failure", "learn": "expected_decision_change"}

#: EXPERIMENTAL candidate policy (lead review; not prereg, not in POLICIES).
#: Selectable in replay by name. Do not add to POLICIES or a real summary.
CANDIDATE_POLICIES = ("decision_lookahead",)

_POLICY_LABELS = {
    "random": "random",
    "greedy_strongest": "confirmation (greedy strongest)",
    "max_failure": "attack (max failure)",
    "max_uncertainty": "max uncertainty",
    "expected_decision_change": "learn (expected decision change)",
    "tauchstone_hybrid": "tauchstone hybrid",
    "decision_lookahead_hybrid": "lookahead hybrid (co-primary)",
}

#: Context types that share the cohort-style similarity bonuses.
_COHORT_LIKE_TYPES = {"held_out_cohort", "composition_adjusted", "cell_type"}


@dataclass(frozen=True)
class Context:
    """One validation context (hidden) or ranking context (observed)."""

    context_id: str
    type: str  # held_out_cohort|composition_adjusted|lincs_context|brain_exposure|cell_type
    label: str
    tissue: str | None = None
    region: str | None = None
    platform: str | None = None
    cell_id: str | None = None
    pert_idose: str | None = None
    pert_itime: str | None = None


@dataclass(frozen=True)
class Observation:
    """A survive/fail outcome in one context."""

    context: Context
    survive: bool
    source: str  # 'ranking' = observed ranking context, 'revealed' = revealed hidden test


def _default_type_priors() -> dict[str, float]:
    return {
        "held_out_cohort": 0.5,
        "composition_adjusted": 0.5,
        "lincs_context": 0.5,
        "brain_exposure": 0.5,
        "cell_type": 0.5,
    }


@dataclass(frozen=True)
class EngineConfig:
    """Engine hyperparameters; prereg values are the defaults."""

    q: float = 0.7
    kappa: float = 2.0
    ranking_weight_cap: float = 4.0
    type_priors: Mapping[str, float] = field(default_factory=_default_type_priors)
    lam: float = 0.25
    lam_lookahead: float = 0.25  # lambda_L for decision_lookahead_hybrid (co-primary)
    supported_threshold: float = 0.8
    fragile_threshold: float = 0.2


def similarity(x: Context, c: Context) -> float:
    """Similarity weight w(x, c) in [0, 1] between hidden context x and context c.

    Same type: start at 0.4. LINCS pairs add same cell_id +0.3, same dose
    +0.15, same time +0.15. Cohort/adjusted/cell-type pairs add same platform
    +0.3, same region +0.3. Capped at 1. Different types: 0.1. ``None``
    metadata never matches (no bonus).
    """
    if x.type != c.type:
        return 0.1
    w = 0.4
    if x.type == "lincs_context":
        if x.cell_id is not None and x.cell_id == c.cell_id:
            w += 0.3
        if x.pert_idose is not None and x.pert_idose == c.pert_idose:
            w += 0.15
        if x.pert_itime is not None and x.pert_itime == c.pert_itime:
            w += 0.15
    elif x.type in _COHORT_LIKE_TYPES:
        if x.platform is not None and x.platform == c.platform:
            w += 0.3
        if x.region is not None and x.region == c.region:
            w += 0.3
    # brain_exposure same-type pairs: base 0.4 only (no bonuses defined).
    return min(1.0, w)


def _weights(
    x: Context, observations: Sequence[Observation], cfg: EngineConfig
) -> tuple[list[float], list[float]]:
    """Return (weights, outcomes) with the ranking-context cap applied.

    Ranking observations' total weight per hidden x is capped at
    ``cfg.ranking_weight_cap`` (scaled down proportionally when exceeded);
    revealed observations are never scaled.
    """
    w_rank: list[tuple[float, float]] = []  # (weight, y)
    w_rev: list[tuple[float, float]] = []
    for o in observations:
        w = similarity(x, o.context)
        y = 1.0 if o.survive else 0.0
        if o.source == "ranking":
            w_rank.append((w, y))
        else:
            w_rev.append((w, y))
    total = sum(w for w, _ in w_rank)
    if total > cfg.ranking_weight_cap and total > 0:
        scale = cfg.ranking_weight_cap / total
        w_rank = [(w * scale, y) for w, y in w_rank]
    weights = [w for w, _ in w_rank] + [w for w, _ in w_rev]
    outcomes = [y for _, y in w_rank] + [y for _, y in w_rev]
    return weights, outcomes


def p_survive(x: Context, observations: Sequence[Observation], cfg: EngineConfig) -> float:
    """Posterior mean P(survive | x, D) = a_x / (a_x + b_x).

    a_x = k*m_t + sum_c w(x,c)*y_c, b_x = k*(1-m_t) + sum_c w(x,c)*(1-y_c),
    with prior mean m_t = cfg.type_priors.get(x.type, 0.5), strength k = kappa,
    and the ranking-weight cap applied (see ``_weights``).
    """
    m = float(cfg.type_priors.get(x.type, 0.5))
    weights, outcomes = _weights(x, observations, cfg)
    alpha = cfg.kappa * m + sum(w * y for w, y in zip(weights, outcomes, strict=True))
    beta = cfg.kappa * (1.0 - m) + sum(w * (1.0 - y) for w, y in zip(weights, outcomes, strict=True))
    return alpha / (alpha + beta)


def _poisson_binomial_sf(ps: Sequence[float], need: int) -> float:
    """P(K >= need) for K ~ Poisson-binomial(ps), by DP with a fresh array per step."""
    n = len(ps)
    if need <= 0:
        return 1.0
    if need > n:
        return 0.0
    dist = [0.0] * (n + 1)
    dist[0] = 1.0
    for p in ps:
        nxt = [0.0] * (n + 1)
        nxt[0] = dist[0] * (1.0 - p)
        for k in range(1, n + 1):
            nxt[k] = dist[k] * (1.0 - p) + dist[k - 1] * p
        dist = nxt
    return float(max(0.0, min(1.0, sum(dist[need:]))))


def _revealed_survivals(observations: Sequence[Observation]) -> int:
    return sum(1 for o in observations if o.source == "revealed" and o.survive)


def p_claim(
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
) -> float:
    """P(claim holds | D): revealed survivals r plus hidden K ~ Poisson-binomial.

    P(C | D) = P(K_hidden >= K* - r) with K* = ceil(q * n_total - 1e-9) and
    ``r`` counted from observations with source == 'revealed'. Deterministic.
    """
    ps = [p_survive(x, observations, cfg) for x in hidden]
    r = _revealed_survivals(observations)
    k_star = math.ceil(cfg.q * n_total - 1e-9)
    return _poisson_binomial_sf(ps, k_star - r)


def verdict(p: float, cfg: EngineConfig) -> str:
    """SUPPORTED_SO_FAR if p >= 0.8, FRAGILE_CONTEXT_DEPENDENT if p <= 0.2, else INSUFFICIENT_EVIDENCE."""
    if p >= cfg.supported_threshold:
        return "SUPPORTED_SO_FAR"
    if p <= cfg.fragile_threshold:
        return "FRAGILE_CONTEXT_DEPENDENT"
    return "INSUFFICIENT_EVIDENCE"


def _learn_scores(
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
) -> dict[str, float]:
    """Expected absolute change in P(C) for each hidden context (learn acquisition)."""
    base = p_claim(hidden, list(observations), n_total, cfg)
    scores: dict[str, float] = {}
    obs = list(observations)
    for x in hidden:
        px = p_survive(x, obs, cfg)
        rest = [h for h in hidden if h.context_id != x.context_id]
        total = 0.0
        for y_int in (0, 1):
            hypo = Observation(context=x, survive=bool(y_int), source="revealed")
            pc = p_claim(rest, obs + [hypo], n_total, cfg)
            w = px if y_int == 1 else (1.0 - px)
            total += w * abs(pc - base)
        scores[x.context_id] = total
    return scores


def decision_utility(p: float, cfg: EngineConfig) -> float:
    """EXPERIMENTAL. Probability the verdict announced at belief p is correct.

    p if p >= supported_threshold (announce SUPPORTED), 1 - p if
    p <= fragile_threshold (announce FRAGILE), else 0 (INSUFFICIENT: no
    announcement possible).
    """
    if p >= cfg.supported_threshold:
        return p
    if p <= cfg.fragile_threshold:
        return 1.0 - p
    return 0.0


def decision_lookahead_scores(
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
    budget_remaining: int,
    lam: float = 0.0,
) -> tuple[dict[str, float], dict[str, float]]:
    """EXPERIMENTAL two-step decision lookahead + learn tie-break scores.

    Depth d = min(2, budget_remaining). d=1: a(x) = E_y[U(after)]. d=2:
    a(x) = E_y[max(U(after), V1(after-state))] where V1 is the best d=1 value
    from the after-state (stopping early when already decisive, hence the
    max). Every hypothetical updates all other hidden posteriors via
    similarity, exactly as in learn. P(C) evaluations are cached by
    revealed-set key. Returns (scores with lam*(1-p_x) added, learn scores).
    """
    if budget_remaining < 1:
        raise ValueError("budget_remaining must be >= 1")
    d = min(2, budget_remaining)
    hidden = list(hidden)
    obs = list(observations)
    cache: dict[tuple[frozenset, frozenset], float] = {}

    def pc(hl: Sequence[Context], ob: list[Observation]) -> float:
        key = (
            frozenset(c.context_id for c in hl),
            frozenset(
                (o.context.context_id, bool(o.survive)) for o in ob if o.source == "revealed"
            ),
        )
        if key not in cache:
            cache[key] = p_claim(list(hl), list(ob), n_total, cfg)
        return cache[key]

    def v1(hl: Sequence[Context], ob: list[Observation]) -> float:
        best = 0.0
        for x2 in hl:
            px2 = p_survive(x2, ob, cfg)
            rest2 = [h for h in hl if h.context_id != x2.context_id]
            val = 0.0
            for y2 in (False, True):
                ob3 = [*ob, Observation(context=x2, survive=y2, source="revealed")]
                w = px2 if y2 else 1.0 - px2
                val += w * decision_utility(pc(rest2, ob3), cfg)
            best = max(best, val)
        return best

    learn = _learn_scores(hidden, obs, n_total, cfg)
    scores: dict[str, float] = {}
    for x in hidden:
        px = p_survive(x, obs, cfg)
        rest = [h for h in hidden if h.context_id != x.context_id]
        a = 0.0
        for y in (False, True):
            ob2 = [*obs, Observation(context=x, survive=y, source="revealed")]
            u = decision_utility(pc(rest, ob2), cfg)
            if d >= 2 and rest:
                u = max(u, v1(rest, ob2))
            a += (px if y else 1.0 - px) * u
        scores[x.context_id] = a + lam * (1.0 - px)
    return scores, learn


def acquisition(
    policy: str,
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
    rng: np.random.Generator,
    budget_remaining: int | None = None,
) -> dict[str, float]:
    """Score every hidden context (higher = reveal next).

    attack/max_failure: 1 - p_x. learn/expected_decision_change: expected
    absolute change in P(C). hybrid: learn + lam * (1 - p_x).
    max_uncertainty: p_x * (1 - p_x). greedy_strongest: p_x. random: uniform.
    decision_lookahead_hybrid (co-primary): two-step decision-lookahead score
    + lam_lookahead * (1 - p_x); lookahead depth defaults to 2 when
    budget_remaining is unknown.
    """
    if policy not in POLICIES:
        raise ValueError(f"unknown policy {policy!r}; expected one of {POLICIES}")
    if policy == "random":
        return {x.context_id: float(rng.random()) for x in hidden}
    px = {x.context_id: p_survive(x, observations, cfg) for x in hidden}
    if policy == "greedy_strongest":
        return dict(px)
    if policy == "max_failure":
        return {cid: 1.0 - p for cid, p in px.items()}
    if policy == "max_uncertainty":
        return {cid: p * (1.0 - p) for cid, p in px.items()}
    learn = _learn_scores(hidden, observations, n_total, cfg)
    if policy == "expected_decision_change":
        return learn
    if policy == "decision_lookahead_hybrid":
        lookahead, _ = decision_lookahead_scores(
            hidden, observations, n_total, cfg, budget_remaining if budget_remaining is not None else 2
        )
        px2 = {x.context_id: p_survive(x, observations, cfg) for x in hidden}
        return {
            x.context_id: lookahead[x.context_id] + cfg.lam_lookahead * (1.0 - px2[x.context_id])
            for x in hidden
        }
    # tauchstone_hybrid
    return {x.context_id: learn[x.context_id] + cfg.lam * (1.0 - px[x.context_id]) for x in hidden}


def choose(
    policy: str,
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
    rng: np.random.Generator,
    budget_remaining: int | None = None,
) -> tuple[str, float, str]:
    """Pick the best hidden context: (context_id, score, rationale sentence).

    Ties break by lower context_id (random draws use the seed, so ties there
    are effectively impossible); lookahead policies (experimental or
    co-primary) break score ties by the learn-mode score first. The rationale
    names the maximised quantity. The experimental lookahead policy requires
    ``budget_remaining``; the co-primary hybrid accepts it and defaults to
    depth 2 without it.
    """
    if not hidden:
        raise ValueError("no hidden contexts to choose from")
    if policy == "decision_lookahead_hybrid":
        if budget_remaining is None:
            scores = acquisition(policy, hidden, observations, n_total, cfg, rng)
            learn = _learn_scores(hidden, observations, n_total, cfg)
            depth = 2
        else:
            scores, learn = decision_lookahead_scores(
                hidden, observations, n_total, cfg, budget_remaining, cfg.lam_lookahead
            )
            depth = min(2, budget_remaining)
        best = min(
            hidden,
            key=lambda x: (-scores[x.context_id], -learn[x.context_id], x.context_id),
        )
        score = scores[best.context_id]
        rationale = (
            f"Largest {depth}-step expected decision utility {score:.3f}: chance the "
            "next test leaves the verdict correct and decisive."
        )
        return best.context_id, score, rationale
    if policy in CANDIDATE_POLICIES:
        if budget_remaining is None:
            raise ValueError(f"policy {policy!r} requires budget_remaining")
        scores, learn = decision_lookahead_scores(
            hidden, observations, n_total, cfg, budget_remaining, 0.0
        )
        best = min(
            hidden,
            key=lambda x: (-scores[x.context_id], -learn[x.context_id], x.context_id),
        )
        score = scores[best.context_id]
        depth = min(2, budget_remaining)
        rationale = (
            f"Largest {depth}-step expected decision utility {score:.3f}: chance the "
            "next test leaves the verdict correct and decisive."
        )
        return best.context_id, score, rationale
    scores = acquisition(policy, hidden, observations, n_total, cfg, rng)
    best = min(hidden, key=lambda x: (-scores[x.context_id], x.context_id))
    score = scores[best.context_id]
    p = p_survive(best, observations, cfg)
    if policy == "max_failure":
        rationale = f"Most likely to break the claim: {(1.0 - p) * 100:.0f}% chance this test fails."
    elif policy == "greedy_strongest":
        rationale = f"Most likely to support the claim: {p * 100:.0f}% chance this test survives."
    elif policy == "max_uncertainty":
        rationale = f"Most uncertain outcome: survive probability {p * 100:.0f}% (closest to a coin flip)."
    elif policy == "expected_decision_change":
        rationale = (
            f"Largest expected belief shift: mean absolute change in P(claim) of {score:.3f}."
        )
    elif policy == "tauchstone_hybrid":
        rationale = (
            f"Largest hybrid score {score:.3f}: expected belief shift plus "
            f"{cfg.lam:g} times the {100 * (1.0 - p):.0f}% chance of failure."
        )
    elif policy == "random":
        rationale = f"Randomly selected (uniform draw, score {score:.2f})."
    else:
        raise ValueError(f"unknown policy {policy!r}; expected one of {POLICIES}")
    _ = _POLICY_LABELS  # human labels for the demo UI live here, not in the rationale.
    return best.context_id, score, rationale


def belief_interval(
    samples: Sequence[float], lower: float = 5.0, upper: float = 95.0
) -> tuple[float, float]:
    """5th-95th percentile band of posterior P(C) samples (the ``Belief.interval``)."""
    if not samples:
        raise ValueError("no samples for belief interval")
    lo, hi = (float(v) for v in np.percentile(list(samples), [lower, upper]))
    return (max(0.0, lo), min(1.0, hi))


def bootstrap_belief_interval(
    hidden: Sequence[Context],
    observations: Sequence[Observation],
    n_total: int,
    cfg: EngineConfig,
    seed: int = 20261105,
    n_resamples: int = 200,
) -> tuple[float, float]:
    """Recompute P(C) on ``n_resamples`` bootstrap resamples of the ranking observations.

    NOTE (approximation, documented): the spec resamples the candidate's
    ranking-context *signatures* and recomputes observations each time. This
    library only sees observations, so it resamples the ranking observations
    with replacement instead (revealed observations stay fixed). The real
    signature-level bootstrap runs upstream with the same seed.
    """
    rng = np.random.default_rng(seed)
    ranking = [o for o in observations if o.source == "ranking"]
    fixed = [o for o in observations if o.source != "ranking"]
    if not ranking:
        p = p_claim(hidden, list(observations), n_total, cfg)
        return (p, p)
    samples: list[float] = []
    m = len(ranking)
    for _ in range(n_resamples):
        draw = rng.integers(0, m, size=m)
        resampled = [ranking[int(i)] for i in draw]
        samples.append(p_claim(hidden, resampled + fixed, n_total, cfg))
    return belief_interval(samples)
