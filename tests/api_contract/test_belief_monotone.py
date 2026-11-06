"""A revealed survive must never lower P(claim holds); a revealed fail must never raise it."""

from app.main import app
from fastapi.testclient import TestClient


def test_belief_moves_in_the_direction_of_the_outcome():
    c = TestClient(app)
    checked = 0
    for cand in c.get("/candidates?limit=10").json()["candidates"]:
        for mode in ("attack", "learn"):
            s = c.post("/attack", json={"candidate_id": cand["id"], "mode": mode}).json()
            while s.get("recommended_context_id"):
                s = c.post(f"/attack/{s['session_id']}/run", json={"context_id": s["recommended_context_id"]}).json()
                r = s["revealed"]
                if r["outcome"] == "survive":
                    assert r["belief_after"] >= r["belief_before"] - 1e-12, r
                else:
                    assert r["belief_after"] <= r["belief_before"] + 1e-12, r
                assert abs(s["belief"]["p_claim_holds"] - r["belief_after"]) < 1e-12
                checked += 1
                if s["done"]:
                    break
    assert checked > 0
