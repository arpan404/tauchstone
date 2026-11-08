"""GET /cell-lines and /cell-lines/{cell_id}/image: cached cell-line cards, offline only.

Facts come from processed/evidence/cell_lines.parquet (pipelines/evidence/cell_lines.py:
Cellosaurus CC BY 4.0 + LINCS metadata); photos from processed/evidence/cell_line_images
(Human Protein Atlas, CC BY 4.0). Nothing is fetched from Cellosaurus or HPA here.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.settings import settings

router = APIRouter()
FIXTURE = Path(__file__).resolve().parents[4] / "contracts/fixtures/listCellLines.json"
FIELDS = ["cell_id", "display_name", "cellosaurus_id", "organ", "sampled_from", "disease",
          "description", "category", "sex", "age", "neural", "summary", "source", "licence",
          "source_url"]


def _paths() -> tuple[Path, Path]:
    evidence = settings.data_dir / "processed" / "evidence"
    return evidence / "cell_lines.parquet", evidence / "cell_line_images"


@lru_cache(maxsize=4)
def _load(path: Path, mtime: float) -> dict:
    frame = pd.read_parquet(path)
    cards = []
    for r in frame.to_dict("records"):
        card: dict[str, object] = {k: (bool(r[k]) if k == "neural" else str(r[k])) for k in FIELDS}
        card["image"] = {
            "url": f"/cell-lines/{r['cell_id']}/image",
            "caption": r["image_caption"], "credit": r["image_credit"],
            "licence": r["image_licence"], "page_url": r["image_page_url"],
            "gene": r["image_gene"],
        } if r.get("has_image") else None
        cards.append(card)
    sidecar = path.with_name(path.name + ".provenance.json")
    provenance = json.loads(sidecar.read_text()) if sidecar.exists() else {
        "dataset_accession": "Cellosaurus", "processing_version": "unspecified",
        "git_commit": "unspecified", "timestamp": "unspecified"}
    return {"cell_lines": cards, "provenance": provenance}


def _cards() -> dict:
    if settings.mock:
        return json.loads(FIXTURE.read_text())
    path, _ = _paths()
    if not path.exists():
        raise HTTPException(404, "Cell-line table not built: run pipelines/evidence/cell_lines.py")
    return _load(path, path.stat().st_mtime)


@router.get("/cell-lines")
def list_cell_lines() -> dict:
    return _cards()


@router.get("/cell-lines/{cell_id}/image")
def get_cell_line_image(cell_id: str):
    card = next((c for c in _cards()["cell_lines"] if c["cell_id"] == cell_id), None)
    if card is None or card["image"] is None or settings.mock:
        raise HTTPException(404, f"No cached image for cell line {cell_id}")
    _, images = _paths()
    path = images / f"{card['cell_id']}.jpg"
    if not path.is_file():
        raise HTTPException(404, f"No cached image for cell line {cell_id}")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})
