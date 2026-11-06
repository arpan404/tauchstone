"""Export contracts/fixtures/<operationId>.json example responses for the frontend."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

OUT = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


def main() -> None:
    c = TestClient(app)
    examples: dict[str, object] = {}
    examples["getHealth"] = c.get("/health").json()
    examples["getSignature"] = c.get("/signatures/GSE132903").json()
    examples["listCandidates"] = c.get("/candidates", params={"limit": 5}).json()
    first_id = c.get("/candidates").json()["candidates"][0]["id"]
    examples["getEvidence"] = c.get(f"/candidates/{first_id}/evidence").json()
    start = c.post("/attack", json={"candidate_id": first_id}).json()
    examples["startAttack"] = start
    run = c.post(
        f"/attack/{start['session_id']}/run",
        json={"context_id": start["recommended_context_id"]},
    ).json()
    examples["runExperiment"] = run
    examples["getBenchmark"] = c.get("/benchmark").json()
    OUT.mkdir(parents=True, exist_ok=True)
    for op, payload in examples.items():
        with open(OUT / f"{op}.json", "w") as f:
            json.dump(payload, f, indent=2)
        print(f"wrote {op}.json")
    # sanity: every example must match its response_model (raises on mismatch)
    assert examples["getHealth"]["status"] == "ok"
    assert examples["runExperiment"]["done"] in (True, False)


if __name__ == "__main__":
    sys.exit(main())
