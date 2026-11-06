"""Stateful attack session: hide truth, recommend, reveal one test at a time.

Thin wrapper over :mod:`pipelines.tauchstone.engine`. Keeps web code out:
``state()`` returns plain JSON-serialisable dicts that map onto the
``AttackSession`` schema in contracts/openapi.yaml, and it never exposes the
outcome (or value) of an unrevealed context.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from pipelines.tauchstone.engine import (
    MODE_TO_POLICY,
    Context,
    EngineConfig,
    Observation,
    acquisition,
    bootstrap_belief_interval,
    choose,
    p_claim,
    p_survive,
    verdict,
)


class AttackSession:
    """One candidate under attack with a fixed reveal budget.

    Parameters
    ----------
    candidate_id: LINCS pert_id of the candidate.
    hidden: the hidden validation contexts (their outcomes are secret).
    truth: context_id -> True (survive) / False (fail), the hidden answers.
    ranking: observed ranking-context observations (source should be 'ranking').
    cfg: engine hyperparameters.
    budget: how many hidden tests may be revealed (default 5).
    mode: 'attack' (max_failure) or 'learn' (expected_decision_change).
    seed: determinism seed; identical inputs + seed -> identical outputs.
    values: optional context_id -> measured value (e.g. consensus score).
    thresholds: optional context_id -> survive threshold.
    rules: optional context_id -> plain-language survive rule.
    theta: optional reversal threshold recorded on the claim.
    """

    def __init__(
        self,
        candidate_id: str,
        hidden: Sequence[Context],
        truth: Mapping[str, bool],
        ranking: Sequence[Observation] = (),
        cfg: EngineConfig | None = None,
        budget: int = 5,
        mode: str = "attack",
        seed: int = 0,
        values: Mapping[str, float | None] | None = None,
        thresholds: Mapping[str, float | None] | None = None,
        rules: Mapping[str, str] | None = None,
        theta: float | None = None,
    ) -> None:
        if mode not in MODE_TO_POLICY:
            raise ValueError(f"unknown mode {mode!r}; expected one of {sorted(MODE_TO_POLICY)}")
        self._candidate_id = candidate_id
        self._hidden: list[Context] = list(hidden)
        self._truth: dict[str, bool] = dict(truth)
        unknown = {c.context_id for c in self._hidden} - set(self._truth)
        if unknown:
            raise ValueError(f"truth missing outcomes for hidden contexts: {sorted(unknown)}")
        self._ranking: list[Observation] = list(ranking)
        self._cfg = cfg or EngineConfig()
        self._budget = budget
        self._mode = mode
        self._seed = seed
        self._values: dict[str, float | None] = dict(values or {})
        self._thresholds: dict[str, float | None] = dict(thresholds or {})
        self._rules: dict[str, str] = dict(rules or {})
        self._theta = theta
        self._revealed: list[Observation] = []  # in reveal order
        self._revealed_ids: list[str] = []
        self._n_total = len(self._hidden)  # |S_d| = hidden + revealed; revealed start at 0
        self._by_id = {c.context_id: c for c in self._hidden}

    # -- internal helpers -------------------------------------------------
    def _observations(self) -> list[Observation]:
        return self._ranking + self._revealed

    def _still_hidden(self) -> list[Context]:
        return [c for c in self._hidden if c.context_id not in self._revealed_ids]

    def _policy(self, mode: str | None = None) -> str:
        return MODE_TO_POLICY[mode or self._mode]

    def _belief(self) -> tuple[float, tuple[float, float]]:
        obs = self._observations()
        p = p_claim(self._still_hidden(), obs, self._n_total, self._cfg)
        lo, hi = bootstrap_belief_interval(
            self._still_hidden(), obs, self._n_total, self._cfg, seed=self._seed
        )
        return p, (lo, hi)

    # -- public API --------------------------------------------------------
    def recommend(self, mode: str | None = None) -> tuple[str, float, str]:
        """Next context to reveal under the session mode (or an override mode)."""
        hidden = self._still_hidden()
        if not hidden:
            raise ValueError("no hidden contexts left to recommend")
        rng = np.random.default_rng([self._seed, len(self._revealed_ids)])
        return choose(self._policy(mode), hidden, self._observations(), self._n_total, self._cfg, rng)

    def run(self, context_id: str, mode: str | None = None) -> dict:
        """Reveal one hidden test, update belief, and recommend the next one.

        Returns a JSON-serialisable dict with the updated session fields plus
        ``revealed`` (outcome, value, threshold, rule, belief_before,
        belief_after) and ``done``. Raises ``ValueError`` for unknown,
        already-revealed, or over-budget reveals.
        """
        if context_id not in self._by_id:
            raise ValueError(f"unknown context {context_id!r} for candidate {self._candidate_id}")
        if context_id in self._revealed_ids:
            raise ValueError(f"context {context_id!r} already revealed")
        if len(self._revealed_ids) >= self._budget:
            raise ValueError("budget exhausted")
        if mode is not None and mode not in MODE_TO_POLICY:
            raise ValueError(f"unknown mode {mode!r}; expected one of {sorted(MODE_TO_POLICY)}")

        p_before, _ = self._belief()
        ctx = self._by_id[context_id]
        outcome = bool(self._truth[context_id])
        self._revealed.append(Observation(context=ctx, survive=outcome, source="revealed"))
        self._revealed_ids.append(context_id)
        if mode is not None:
            self._mode = mode

        p_after, _ = self._belief()
        revealed = {
            "context_id": context_id,
            "type": ctx.type,
            "label": ctx.label,
            "outcome": "survive" if outcome else "fail",
            "value": self._values.get(context_id),
            "threshold": self._thresholds.get(context_id),
            "rule": self._rules.get(
                context_id, "Survive if the reversal holds in this validation context."
            ),
            "belief_before": p_before,
            "belief_after": p_after,
            "mode_used": self._mode,
        }
        out = self.state()
        out["revealed"] = revealed
        out["done"] = len(self._revealed_ids) >= self._budget or not self._still_hidden()
        return out

    def state(self) -> dict:
        """JSON-serialisable session snapshot; never includes unrevealed outcomes."""
        obs = self._observations()
        p, (lo, hi) = self._belief()
        v = verdict(p, self._cfg)
        policy = self._policy()
        rng = np.random.default_rng([self._seed, len(self._revealed_ids)])
        scores = acquisition(policy, self._still_hidden(), obs, self._n_total, self._cfg, rng)
        contexts: list[dict] = []
        for c in self._hidden:
            if c.context_id in self._revealed_ids:
                entry = {
                    "context_id": c.context_id,
                    "type": c.type,
                    "label": c.label,
                    "status": "revealed",
                    "p_survive": p_survive(c, obs, self._cfg),
                    "acquisition": None,
                    "outcome": "survive" if self._truth[c.context_id] else "fail",
                }
            else:
                entry = {
                    "context_id": c.context_id,
                    "type": c.type,
                    "label": c.label,
                    "status": "hidden",
                    "p_survive": p_survive(c, obs, self._cfg),
                    "acquisition": scores[c.context_id],
                    "outcome": None,
                }
            contexts.append(entry)
        try:
            rec_id, _, rationale = self.recommend()
        except ValueError:
            rec_id, rationale = None, "No hidden contexts remain."
        history = [
            {
                "context_id": o.context.context_id,
                "type": o.context.type,
                "label": o.context.label,
                "outcome": "survive" if o.survive else "fail",
                "rule": self._rules.get(o.context.context_id, ""),
                "belief_before": None,
                "belief_after": None,
            }
            for o in self._revealed
        ]
        return {
            "candidate_id": self._candidate_id,
            "mode": self._mode,
            "budget": self._budget,
            "budget_remaining": self._budget - len(self._revealed_ids),
            "claim": {
                "text": (
                    f"{self._candidate_id} reverses the AD signature in at least "
                    f"{self._cfg.q:.0%} of predefined validation contexts"
                ),
                "q": self._cfg.q,
                "theta": self._theta,
                "n_contexts": self._n_total,
            },
            "belief": {"p_claim_holds": p, "interval": [lo, hi]},
            "verdict": v,
            "contexts": contexts,
            "recommended_context_id": rec_id,
            "rationale": rationale,
            "history": history,
        }
