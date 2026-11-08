"""Preregistration v2 is frozen: its bytes must match the hash recorded in the integrity log,
and v1 must still be byte-identical to its frozen hash."""
import hashlib
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
V1 = ROOT / "data/manifests/preregistration.yaml"
V2 = ROOT / "data/manifests/preregistration_v2.yaml"
LOG = ROOT / "docs/integrity_log.md"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_v1_unchanged():
    assert sha(V1) == "21f7460e4319a7e30a24af50d7b3cfa2da84adbd0313b44250ed6bd1834bb8a3"


def test_v2_matches_recorded_hash_and_is_frozen():
    recorded = re.search(r"preregistration_v2\.yaml`, sha256 `([0-9a-f]{64})`", LOG.read_text())
    assert recorded, "integrity log must record the v2 hash"
    assert sha(V2) == recorded.group(1), "preregistration_v2.yaml changed after it was frozen"
    assert yaml.safe_load(V2.read_text())["status"] == "frozen"


def test_v2_inherits_v1_by_hash():
    v2 = yaml.safe_load(V2.read_text())
    assert sha(V1).startswith(v2["inherits_from_v1"]["sha256_prefix"])
