"""Where data lives. Raw and processed data sit outside git, in one shared folder,
so every agent worktree reads and writes the same files.

Override with TS_DATA_DIR. Default: ~/Data/tauchstone
"""

from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone"))
RAW = DATA_DIR / "raw"
PROCESSED = DATA_DIR / "processed"
MANIFESTS = REPO / "data" / "manifests"
DEMO = REPO / "data" / "demo"


def processed(*parts: str) -> Path:
    """Path under processed/, creating parent folders."""
    p = PROCESSED.joinpath(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p
