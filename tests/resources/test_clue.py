"""CLUE's optional archive parser is exercised without credentials or network."""
from __future__ import annotations

import io
import tarfile

import h5py
import numpy as np
import pytest

from pipelines.resources.clue import parse_archive


def archive(values=(-30., 12., -666., np.nan), queries=1):
    buffer = io.BytesIO()
    with h5py.File(buffer, "w") as data:
        data.create_dataset("/0/META/ROW/id", data=np.array(["A", "B", "C", "D"], dtype="S"))
        data.create_dataset("/0/META/ROW/pert_iname",
                            data=np.array(["Drug-A sodium", "Drug B", "Missing", "Null"], dtype="S"))
        data.create_dataset("/0/META/COL/id", data=np.array([f"query{i}" for i in range(queries)], dtype="S"))
        data.create_dataset("/0/DATA/0/matrix", data=np.tile(values, (queries, 1)))
    raw = buffer.getvalue()
    target = io.BytesIO()
    with tarfile.open(fileobj=target, mode="w:gz") as tar:
        member = tarfile.TarInfo("job/gutc/ps_pert_summary.gctx")
        member.size = len(raw)
        tar.addfile(member, io.BytesIO(raw))
    return target.getvalue()


def test_clue_tau_direction_and_missing_values():
    rows = parse_archive(archive())
    assert [(r["name"], r["rank"], r["score"]) for r in rows] == [("druga", 1, -30.), ("drugb", 2, 12.)]


def test_clue_rejects_multiple_queries():
    with pytest.raises(ValueError, match="one query"):
        parse_archive(archive(queries=2))


def test_clue_rejects_wrong_output_member():
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz"):
        pass
    with pytest.raises(ValueError, match="exactly one"):
        parse_archive(buffer.getvalue())


def test_offline_archive_is_bound_to_exact_query(tmp_path):
    import hashlib
    import json

    from pipelines.resources.cache import Cache
    from pipelines.resources.clue import fetch

    cache = Cache(tmp_path, offline=True)
    path = cache.record("results.tar.gz", archive(), "https://example.org/results")
    meta_path = path.with_name(path.name + ".meta.json")
    meta = json.loads(meta_path.read_text())
    meta["query_sha256"] = hashlib.sha256(json.dumps([["1"], ["2"]]).encode()).hexdigest()
    meta["http_status"] = 200
    meta_path.write_text(json.dumps(meta))
    assert len(fetch(["1"], ["2"], "unused", cache)) == 2
    with pytest.raises(FileNotFoundError):
        fetch(["3"], ["2"], "unused", cache)
