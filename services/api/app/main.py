"""Tauchstone: Second Life API.

Hidden validation outcomes (the truth table) stay server-side. A value is only
returned after POST /attack/{session}/run records a committed experiment.
Endpoints are defined in contracts/openapi.yaml; build against that, not this file.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import attack, benchmark, candidates, lab, signatures, single_cell, structures
from app.schemas.models import Health
from app.settings import settings

app = FastAPI(title="Tauchstone: Second Life", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signatures.router)
app.include_router(candidates.router)
app.include_router(attack.router)
app.include_router(benchmark.router)
app.include_router(structures.router)
app.include_router(single_cell.router)
app.include_router(lab.router)


@app.get("/health", response_model=Health, response_model_exclude_unset=True)
def health() -> dict:
    return {"status": "ok", "mock": settings.mock}
