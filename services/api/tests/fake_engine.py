"""Fake engine with the same interface as the real WS5 AttackSession.

Used to test routes in isolation via FastAPI dependency overrides:

    app.dependency_overrides[get_engine_factory] = lambda: make_fake_session

(The lambda matters: FastAPI inspects the override's signature as request
params, so the override itself must take no arguments.)
"""

from __future__ import annotations


class FakeSession:
    """Minimal deterministic session: canned outcomes, valid payloads."""

    def __init__(self, candidate_id, hidden, ranking, cfg, budget=5, mode="attack",
                 seed=20261105, candidate_name=None) -> None:
        self.candidate_id = candidate_id
        self.candidate_name = candidate_name or candidate_id
        self._hidden = list(hidden)
        self._revealed: list[str] = []
        self.budget = budget
        self.budget_remaining = budget
        self.mode = mode
        self.cfg = cfg

    def _remaining(self):
        return [h for h in self._hidden if h.context.context_id not in self._revealed]

    def state(self) -> dict:
        rem = self._remaining()
        rec = rem[0].context.context_id if rem and self.budget_remaining > 0 else None
        contexts = [
            {
                "context_id": h.context.context_id, "type": h.context.type,
                "label": h.context.label,
                "status": "revealed" if h.context.context_id in self._revealed else "hidden",
                "p_survive": 0.5, "acquisition": 0.5 if h.context.context_id not in self._revealed else None,
                "outcome": None,
            }
            for h in sorted(self._hidden, key=lambda h: h.context.context_id)
        ]
        return {
            "candidate_id": self.candidate_id, "candidate_name": self.candidate_name,
            "mode": self.mode, "budget": self.budget,
            "budget_remaining": self.budget_remaining,
            "claim": {"text": "fake claim", "q": 0.7, "theta": -1.0,
                      "n_contexts": len(self._hidden)},
            "belief": {"p_claim_holds": 0.5, "interval": [0.4, 0.6]},
            "verdict": "INSUFFICIENT_EVIDENCE", "contexts": contexts,
            "recommended_context_id": rec, "rationale": "fake rationale",
            "history": [],
        }

    def recommend(self):
        rem = self._remaining()
        if not rem or self.budget_remaining <= 0:
            return None, 0.0, "fake: nothing left"
        return rem[0].context.context_id, 0.5, "fake rationale"

    def run(self, context_id: str, mode=None):
        from app.services.engine_adapter import (
            AlreadyRevealedError,
            BudgetExhaustedError,
            ContextNotFoundError,
        )

        by_id = {h.context.context_id: h for h in self._hidden}
        if context_id not in by_id:
            raise ContextNotFoundError(f"unknown context: {context_id}")
        if context_id in self._revealed:
            raise AlreadyRevealedError(f"already revealed: {context_id}")
        if self.budget_remaining <= 0:
            raise BudgetExhaustedError("budget exhausted")
        if mode in ("attack", "learn"):
            self.mode = mode
        h = by_id[context_id]
        self._revealed.append(context_id)
        self.budget_remaining -= 1
        revealed = {
            "context_id": context_id, "type": h.context.type, "label": h.context.label,
            "outcome": h.outcome, "value": h.value, "threshold": h.threshold,
            "rule": h.rule or "fake rule", "detail": "", "belief_before": 0.5,
            "belief_after": 0.5, "mode_used": self.mode, "cohort": h.context.cohort,
        }
        out = self.state()
        out["revealed"] = revealed
        out["done"] = self.budget_remaining <= 0
        return out


def make_fake_session(candidate_id, hidden, ranking, cfg, budget=5, mode="attack",
                      seed=20261105, candidate_name=None, engine_cfg=None):
    return FakeSession(candidate_id, hidden, ranking, cfg, budget, mode, seed, candidate_name)
