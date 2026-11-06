"""Provenance record written next to every processed output.

Fields follow the build plan: dataset accession, checksum, processing version, git
commit, sample filter, gene mapping version, model and parameters, random seed,
validation context, timestamp.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from pipelines.common.paths import MANIFESTS, REPO

PROCESSING_VERSION = "0.1.0"


def git_commit() -> str:
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
        dirty = subprocess.call(["git", "diff", "--quiet"], cwd=REPO) != 0
        return sha + ("-dirty" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def raw_checksum(key: str) -> str | None:
    """SHA-256 of a raw file as frozen by scripts/fetch_data.py, e.g. 'geo/GSE53697/GSE53697_RNAseq_AD.txt.gz'."""
    path = MANIFESTS / "checksums.json"
    if not path.exists():
        return None
    return json.loads(path.read_text()).get(key, {}).get("sha256")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class Provenance:
    step: str
    dataset_accession: str | list[str]
    inputs: dict[str, str | None] = field(default_factory=dict)  # raw key -> sha256
    sample_filter: str = "none"
    gene_mapping_version: str = "unspecified"
    model: str = ""
    parameters: dict[str, Any] = field(default_factory=dict)
    random_seed: int | None = None
    validation_context: str | None = None
    processing_version: str = PROCESSING_VERSION
    git_commit: str = field(default_factory=git_commit)
    timestamp: str = field(
        default_factory=lambda: dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    )

    def write(self, output: Path) -> Path:
        """Write <output>.provenance.json with the output's own checksum included."""
        record = asdict(self) | {"output": output.name, "output_sha256": sha256_file(output)}
        dest = output.with_name(output.name + ".provenance.json")
        dest.write_text(json.dumps(record, indent=2) + "\n")
        return dest
