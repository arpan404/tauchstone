"""POST /attack and POST /attack/{session_id}/run."""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_engine_factory, get_repository, get_session_store
from app.present import public
from app.schemas.models import AttackSessionState, RunExperimentRequest, RunResult, StartAttackRequest
from app.services.engine_adapter import (
    AlreadyRevealedError,
    BudgetExhaustedError,
    ContextNotFoundError,
    EngineConfig,
)
from app.services.repository import NotFoundError, Repository
from app.services.sessions import SessionStore

router = APIRouter()

SEED = 20261105


def _to_session_payload(session_id: str, state: dict) -> dict:
    return {
        "session_id": session_id,
        "candidate_id": state["candidate_id"],
        "candidate_name": state.get("candidate_name"),
        "mode": state["mode"],
        "budget": state["budget"],
        "budget_remaining": state["budget_remaining"],
        "claim": state["claim"],
        "belief": state["belief"],
        "verdict": state["verdict"],
        "contexts": state["contexts"],
        "recommended_context_id": state["recommended_context_id"],
        "rationale": state["rationale"],
        "history": state.get("history", []),
    }


@router.post("/attack", response_model=AttackSessionState, response_model_exclude_unset=True)
def start_attack(
    body: StartAttackRequest,
    repo: Annotated[Repository, Depends(get_repository)],
    store: Annotated[SessionStore, Depends(get_session_store)],
    make_session: Annotated[Callable, Depends(get_engine_factory)],
) -> dict:
    try:
        world = repo.get_attack_world(body.candidate_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    assert world.claim is not None
    cfg = EngineConfig(q=world.claim.q, theta=world.claim.theta, claim_text=world.claim.text)
    engine = make_session(
        world.candidate_id, world.hidden, world.ranking, cfg,
        budget=body.budget, mode=body.mode, seed=SEED,
        candidate_name=world.candidate_name, engine_cfg=world.engine_cfg,
    )
    rec = store.create(engine, world.candidate_id)
    return public(_to_session_payload(rec.session_id, engine.state()))


@router.post("/attack/{session_id}/run", response_model=RunResult, response_model_exclude_unset=True)
def run_experiment(
    session_id: str,
    body: RunExperimentRequest,
    store: Annotated[SessionStore, Depends(get_session_store)],
) -> dict:
    rec = store.get(session_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"unknown session: {session_id}")
    try:
        out = rec.engine.run(body.context_id, mode=body.mode)
    except (ContextNotFoundError, AlreadyRevealedError, BudgetExhaustedError) as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    revealed = out["revealed"]
    store.note_revealed_cohort(session_id, revealed.get("cohort"))
    payload = _to_session_payload(session_id, out)
    payload["revealed"] = {k: v for k, v in revealed.items() if k != "cohort"}
    payload["done"] = out.get("done", False)
    return public(payload)
