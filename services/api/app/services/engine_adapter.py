"""Adapter over the WS5 Tauchstone engine.

Uses the real engine (``pipelines.tauchstone.session.AttackSession``) when that
module exists on the import path, otherwise falls back to the local mock engine
below (same constructor / method interface) and logs a warning.

Required interface (both implementations):
    Session(candidate_id, hidden, ranking, cfg, budget=5, mode='attack', seed=...)
    .state()     -> dict, never contains unrevealed outcomes/values/thresholds
    .recommend() -> (context_id | None, score, rationale)
    .run(context_id, mode=None) -> dict with revealed outcome fields
"""

from __future__ import annotations

import importlib.util
import logging
import math
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

MODE_TO_POLICY = {"attack": "max_failure", "learn": "expected_decision_change"}

_REAL = False
try:
    _REAL = (
        importlib.util.find_spec("pipelines.tauchstone.session") is not None
        and importlib.util.find_spec("pipelines.tauchstone.engine") is not None
    )
except (ImportError, AttributeError, ValueError):
    _REAL = False
if not _REAL:  # pragma: no cover - exercised until the WS5 module lands
    log.warning("pipelines.tauchstone not importable; using mock engine")


# ----------------------------------------------------------------------------
# Shared value objects (mirrored by the real engine)
# ----------------------------------------------------------------------------


@dataclass
class Context:
    context_id: str
    type: str
    label: str
    tissue: str | None = None
    region: str | None = None
    platform: str | None = None
    cell_id: str | None = None
    pert_idose: str | None = None
    pert_itime: str | None = None
    cohort: str | None = None  # accession gated by this context (held-out cohorts)


@dataclass
class Observation:
    context: Context
    survive: bool
    source: str = "ranking"  # 'ranking' | 'revealed'


@dataclass
class HiddenRow:
    context: Context
    outcome: str  # 'survive' | 'fail'
    value: float | None = None
    threshold: float | None = None
    rule: str = ""
    detail: str = ""


@dataclass
class EngineConfig:
    """Claim/belief hyperparameters (prereg values from contracts/algorithms.md)."""

    q: float = 0.7
    kappa: float = 2.0
    m_t: dict[str, float] = field(default_factory=dict)  # per-type prior survive rate
    theta: float = -1.0
    claim_text: str = ""

    def m(self, t: str) -> float:
        return self.m_t.get(t, 0.5)


# ----------------------------------------------------------------------------
# Mock engine: similarity-weighted Beta posterior + Poisson-binomial claim belief
# ----------------------------------------------------------------------------


def similarity(x: Context, c: Context) -> float:
    """Prereg similarity w(x, c) in [0, 1] (contracts/algorithms.md section 4)."""
    if x.type != c.type:
        return 0.1
    w = 0.4
    if x.type == "lincs_context":
        if x.cell_id and x.cell_id == c.cell_id:
            w += 0.3
        if x.pert_idose and x.pert_idose == c.pert_idose:
            w += 0.15
        if x.pert_itime and x.pert_itime == c.pert_itime:
            w += 0.15
    elif x.type in ("held_out_cohort", "composition_adjusted", "cell_type"):
        if x.platform and x.platform == c.platform:
            w += 0.3
        if x.region and x.region == c.region:
            w += 0.3
    return min(1.0, w)


def _posterior_p(
    x: Context, cfg: EngineConfig, obs: list[Observation], revealed_extra: Observation | None = None
) -> float:
    """P(survive | x, D); ranking weights capped at total 4 (prereg)."""
    all_obs = list(obs) + ([revealed_extra] if revealed_extra else [])
    rank_w = [similarity(x, o.context) for o in all_obs if o.source == "ranking"]
    scale = 4.0 / sum(rank_w) if sum(rank_w) > 4.0 else 1.0
    alpha = cfg.kappa * cfg.m(x.type)
    beta = cfg.kappa * (1.0 - cfg.m(x.type))
    for o, w in zip(all_obs, [similarity(x, o.context) for o in all_obs], strict=True):
        w = w * scale if o.source == "ranking" else w
        alpha += w * (1.0 if o.survive else 0.0)
        beta += w * (0.0 if o.survive else 1.0)
    return alpha / (alpha + beta)


def _poisson_binomial_sf(probs: list[float], need: int) -> float:
    """P(K >= need) for K ~ Poisson-binomial(probs) via DP."""
    if need <= 0:
        return 1.0
    if need > len(probs):
        return 0.0
    dp = [0.0] * (len(probs) + 1)
    dp[0] = 1.0
    for p in probs:
        for k in range(len(probs), 0, -1):
            dp[k] = dp[k] * (1.0 - p) + dp[k - 1] * p
        dp[0] *= 1.0 - p
    return sum(dp[need:])


def _claim_prob(
    hidden_ps: list[float], n_revealed_survive: int, k_star: int
) -> float:
    return _poisson_binomial_sf(hidden_ps, max(0, k_star - n_revealed_survive))


def verdict_for(p: float) -> str:
    if p >= 0.8:
        return "SUPPORTED_SO_FAR"
    if p <= 0.2:
        return "FRAGILE_CONTEXT_DEPENDENT"
    return "INSUFFICIENT_EVIDENCE"


class ContextNotFoundError(ValueError):
    pass


class AlreadyRevealedError(ValueError):
    pass


class BudgetExhaustedError(ValueError):
    pass


class MockAttackSession:
    """Deterministic mock of the WS5 AttackSession (mock-world use only)."""

    def __init__(
        self,
        candidate_id: str,
        hidden: list[HiddenRow],
        ranking: list[Observation],
        cfg: EngineConfig,
        budget: int = 5,
        mode: str = "attack",
        seed: int = 20261105,
        candidate_name: str | None = None,
    ) -> None:
        self.candidate_id = candidate_id
        self.candidate_name = candidate_name or candidate_id
        self.hidden = list(hidden)
        self.ranking = list(ranking)
        self.cfg = cfg
        self.budget = budget
        self.budget_remaining = budget
        self.mode = mode
        self.seed = seed
        self.revealed: list[dict] = []  # revealed outcome dicts (committed only)
        self._revealed_ids: set[str] = set()

    # -- internals ---------------------------------------------------------
    def _obs(self) -> list[Observation]:
        obs = list(self.ranking)
        by_id = {h.context.context_id: h for h in self.hidden}
        for r in self.revealed:
            h = by_id[r["context_id"]]
            obs.append(Observation(context=h.context, survive=r["outcome"] == "survive", source="revealed"))
        return obs

    def _hidden_ps(self, obs: list[Observation] | None = None) -> dict[str, float]:
        obs = obs if obs is not None else self._obs()
        return {
            h.context.context_id: _posterior_p(h.context, self.cfg, obs)
            for h in self.hidden
            if h.context.context_id not in self._revealed_ids
        }

    def _belief(self, ps: dict[str, float] | None = None) -> tuple[float, list[float]]:
        ps = ps if ps is not None else self._hidden_ps()
        r = sum(1 for x in self.revealed if x["outcome"] == "survive")
        k_star = math.ceil(self.cfg.q * len(self.hidden))
        p = _claim_prob(list(ps.values()), r, k_star)
        half = 0.12 / math.sqrt(1 + len(self.revealed))  # mock interval, deterministic
        return p, [max(0.0, p - half), min(1.0, p + half)]

    def _acquisition(self, cid: str, ps: dict[str, float], p_claim: float) -> float:
        if self.mode == "learn":
            # expected decision change: hypothetical y updates every other hidden posterior
            p = ps[cid]
            total = 0.0
            for y, py in ((True, p), (False, 1.0 - p)):
                h = next(h for h in self.hidden if h.context.context_id == cid)
                hypo = Observation(context=h.context, survive=y, source="revealed")
                ps2 = {
                    k2: _posterior_p(
                        next(h2 for h2 in self.hidden if h2.context.context_id == k2).context,
                        self.cfg,
                        self._obs(),
                        revealed_extra=hypo,
                    )
                    for k2 in ps
                    if k2 != cid
                }
                r = sum(1 for x in self.revealed if x["outcome"] == "survive") + (1 if y else 0)
                k_star = math.ceil(self.cfg.q * len(self.hidden))
                p2 = _claim_prob(list(ps2.values()), r, k_star)
                total += py * abs(p2 - p_claim)
            return total
        if self.mode == "learn_max_uncertainty":
            p = ps[cid]
            return p * (1.0 - p)
        return 1.0 - ps[cid]  # attack: max_failure

    # -- public interface --------------------------------------------------
    def state(self) -> dict:
        ps = self._hidden_ps()
        p_claim, interval = self._belief(ps)
        rec_id, _, rationale = self.recommend(_ps=ps, _p_claim=p_claim)
        contexts = []
        for h in sorted(self.hidden, key=lambda h: h.context.context_id):
            cid = h.context.context_id
            if cid in self._revealed_ids:
                r = next(x for x in self.revealed if x["context_id"] == cid)
                contexts.append(
                    {
                        "context_id": cid,
                        "type": h.context.type,
                        "label": h.context.label,
                        "status": "revealed",
                        "p_survive": 1.0 if r["outcome"] == "survive" else 0.0,
                        "acquisition": None,
                        "outcome": r["outcome"],
                    }
                )
            else:
                contexts.append(
                    {
                        "context_id": cid,
                        "type": h.context.type,
                        "label": h.context.label,
                        "status": "hidden",
                        "p_survive": ps[cid],
                        "acquisition": self._acquisition(cid, ps, p_claim),
                        "outcome": None,
                    }
                )
        return {
            "candidate_id": self.candidate_id,
            "candidate_name": self.candidate_name,
            "mode": self.mode if self.mode in ("attack", "learn") else "attack",
            "budget": self.budget,
            "budget_remaining": self.budget_remaining,
            "claim": {
                "text": self.cfg.claim_text,
                "q": self.cfg.q,
                "theta": self.cfg.theta,
                "n_contexts": len(self.hidden),
            },
            "belief": {"p_claim_holds": p_claim, "interval": interval},
            "verdict": verdict_for(p_claim),
            "contexts": contexts,
            "recommended_context_id": rec_id,
            "rationale": rationale,
            "history": list(self.revealed),
            "revealed_cohorts": sorted(
                {
                    h.context.cohort
                    for h in self.hidden
                    if h.context.context_id in self._revealed_ids and h.context.cohort
                }
            ),
        }

    def recommend(
        self, _ps: dict[str, float] | None = None, _p_claim: float | None = None
    ) -> tuple[str | None, float, str]:
        ps = _ps if _ps is not None else self._hidden_ps()
        if not ps or self.budget_remaining <= 0:
            return None, 0.0, "No hidden contexts remain within budget."
        p_claim = _p_claim if _p_claim is not None else self._belief(ps)[0]
        scored = sorted(
            ((cid, self._acquisition(cid, ps, p_claim)) for cid in ps),
            key=lambda kv: (-kv[1], kv[0]),
        )
        cid, score = scored[0]
        if self.mode == "learn":
            rationale = (
                f"Maximising expected decision change ({score:.3f}) for {cid} "
                "(learn: largest expected change in belief)."
            )
        else:
            rationale = (
                f"Maximising P(fail) ({1.0 - ps[cid]:.2f}) for {cid} "
                "(attack: the context most likely to break the claim)."
            )
        return cid, score, rationale

    def run(self, context_id: str, mode: str | None = None) -> dict:
        by_id = {h.context.context_id: h for h in self.hidden}
        if context_id not in by_id:
            raise ContextNotFoundError(f"unknown context for this candidate: {context_id}")
        if context_id in self._revealed_ids:
            raise AlreadyRevealedError(f"context already revealed: {context_id}")
        if self.budget_remaining <= 0:
            raise BudgetExhaustedError("budget exhausted")
        if mode in ("attack", "learn"):
            self.mode = mode
        belief_before = self._belief()[0]
        h = by_id[context_id]
        revealed = {
            "context_id": context_id,
            "type": h.context.type,
            "label": h.context.label,
            "outcome": h.outcome,
            "value": h.value,
            "threshold": h.threshold,
            "rule": h.rule,
            "detail": h.detail,
            "belief_before": belief_before,
            "belief_after": None,  # filled in below, after the outcome is recorded
            "mode_used": self.mode if self.mode in ("attack", "learn") else "attack",
            "cohort": h.context.cohort,
        }
        # Record the outcome before recomputing belief: the context leaves the hidden set and
        # its result must enter both the survive count and the posterior observations.
        self.revealed.append(revealed)
        self._revealed_ids.add(context_id)
        self.budget_remaining -= 1
        revealed["belief_after"] = self._belief()[0]
        out = self.state()
        out["revealed"] = revealed
        out["done"] = self.budget_remaining <= 0 or len(self._revealed_ids) >= len(self.hidden)
        return out


class RealAttackSession:
    """Wraps the WS5 engine (pipelines.tauchstone.session.AttackSession) behind the API interface.

    Translates the API's value objects into the engine's, keeps the full revealed history
    (the engine's own history omits beliefs), carries the held-out cohort accession used to
    gate /signatures, and stops recommending once the budget is spent.
    """

    def __init__(
        self,
        candidate_id: str,
        hidden: list[HiddenRow],
        ranking: list[Observation],
        cfg: EngineConfig,
        budget: int = 5,
        mode: str = "attack",
        seed: int = 20261105,
        candidate_name: str | None = None,
    ) -> None:
        from pipelines.tauchstone import engine as eng
        from pipelines.tauchstone.session import AttackSession

        def to_ctx(c: Context) -> eng.Context:
            return eng.Context(
                context_id=c.context_id, type=c.type, label=c.label, tissue=c.tissue,
                region=c.region, platform=c.platform, cell_id=c.cell_id,
                pert_idose=c.pert_idose, pert_itime=c.pert_itime,
            )

        self.candidate_name = candidate_name or candidate_id
        self.budget = budget
        self._rows = {h.context.context_id: h for h in hidden}
        self._history: list[dict] = []
        type_priors = {t: cfg.m(t) for t in
                       ("held_out_cohort", "composition_adjusted", "lincs_context", "brain_exposure", "cell_type")}
        self._session = AttackSession(
            candidate_id,
            hidden=[to_ctx(h.context) for h in hidden],
            truth={h.context.context_id: h.outcome == "survive" for h in hidden},
            ranking=[eng.Observation(context=to_ctx(o.context), survive=o.survive, source="ranking")
                     for o in ranking],
            cfg=eng.EngineConfig(q=cfg.q, kappa=cfg.kappa, type_priors=type_priors),
            budget=budget,
            mode=mode,
            seed=seed,
            values={h.context.context_id: h.value for h in hidden},
            thresholds={h.context.context_id: h.threshold for h in hidden},
            rules={h.context.context_id: h.rule for h in hidden},
            theta=cfg.theta,
        )

    def state(self) -> dict:
        st = self._session.state()
        st["candidate_name"] = self.candidate_name
        st["claim"]["text"] = (
            f"{self.candidate_name} reverses the AD signature in at least "
            f"{st['claim']['q']:.0%} of predefined validation contexts"
        )
        st["history"] = list(self._history)
        if st["budget_remaining"] <= 0:
            st["recommended_context_id"] = None
            st["rationale"] = "Budget used up."
            for c in st["contexts"]:
                if c["status"] == "hidden":
                    c["acquisition"] = None
        return st

    def recommend(self) -> tuple[str | None, float, str]:
        if self.state()["budget_remaining"] <= 0:
            return None, 0.0, "Budget used up."
        try:
            return self._session.recommend()
        except ValueError:
            return None, 0.0, "No hidden contexts remain."

    def run(self, context_id: str, mode: str | None = None) -> dict:
        if context_id not in self._rows:
            raise ContextNotFoundError(f"unknown context for this candidate: {context_id}")
        if any(h["context_id"] == context_id for h in self._history):
            raise AlreadyRevealedError(f"context already revealed: {context_id}")
        if len(self._history) >= self.budget:
            raise BudgetExhaustedError("budget exhausted")
        out = self._session.run(context_id, mode=mode if mode in ("attack", "learn") else None)
        revealed = dict(out["revealed"])
        revealed["detail"] = self._rows[context_id].detail
        self._history.append(revealed)
        state = self.state()
        state["revealed"] = revealed | {"cohort": self._rows[context_id].context.cohort}
        state["done"] = out["done"]
        return state


def create_attack_session(
    candidate_id: str,
    hidden: list[HiddenRow],
    ranking: list[Observation],
    cfg: EngineConfig,
    budget: int = 5,
    mode: str = "attack",
    seed: int = 20261105,
    candidate_name: str | None = None,
):
    """Build a session: the real WS5 engine when importable, else the mock engine."""
    cls = RealAttackSession if _REAL else MockAttackSession
    return cls(candidate_id, hidden, ranking, cfg, budget, mode, seed, candidate_name)


def is_real() -> bool:
    """True once the WS5 engine module is importable (adapter switches automatically)."""
    return _REAL
