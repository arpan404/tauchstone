"""Optional CLUE query jobs, following its published Query API tutorial."""

from __future__ import annotations

import hashlib
import io
import json
import tarfile
import time

import h5py
import httpx
import numpy as np

from pipelines.resources.cache import redact
from pipelines.resources.perturbseqr import normalize_name, rank_compounds

URL = "https://api.clue.io/api/jobs"


def parse_archive(content: bytes) -> list[dict]:
    """Read per-compound tau summary directly from tar; never extract paths."""
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
        members = [
            m
            for m in archive.getmembers()
            if m.name.endswith("/ps_pert_summary.gctx") or m.name == "ps_pert_summary.gctx"
        ]
        if len(members) != 1:
            raise ValueError("Expected exactly one ps_pert_summary.gctx")
        handle = archive.extractfile(members[0])
        if handle is None:
            raise ValueError("Missing CLUE summary content")
        with h5py.File(io.BytesIO(handle.read()), "r") as data:

            def decode(values):
                return [v.decode() if isinstance(v, bytes) else str(v) for v in values]

            ids = decode(data["/0/META/ROW/id"][:])
            names = decode(data["/0/META/ROW/pert_iname"][:]) if "/0/META/ROW/pert_iname" in data else ids
            queries = decode(data["/0/META/COL/id"][:])
            values = data["/0/DATA/0/matrix"][:]
            if len(queries) != 1 or values.shape != (1, len(ids)):
                raise ValueError("Expected one query and per-compound rows in CLUE GCTX")
            return rank_compounds(
                [
                    {"name": normalize_name(name), "score": float(score), "libraries": ["CLUE Touchstone"]}
                    for name, score in zip(names, values[0], strict=True)
                    if np.isfinite(score) and score != -666
                ]
            )


def fetch(up: list[str], down: list[str], key: str, cache) -> list[dict]:
    query_hash = hashlib.sha256(json.dumps([up, down]).encode()).hexdigest()
    if cache.offline:
        archives = [
            path for path in sorted(cache.root.glob("*_results.tar.gz"))
            if json.loads(path.with_name(path.name + ".meta.json").read_text()).get("query_sha256") == query_hash
        ]
        if not archives:
            raise FileNotFoundError("No cached CLUE archive")
        # Use recorded checksum rather than trusting a cached binary.
        path = archives[-1]
        meta = json.loads(path.with_name(path.name + ".meta.json").read_text())
        content = path.read_bytes()
        if meta.get("http_status") != 200:
            raise ValueError("Cached CLUE download was unsuccessful")
        if hashlib.sha256(content).hexdigest() != meta["sha256"]:
            raise ValueError("CLUE archive checksum mismatch")
        cache.inputs[str(path)] = meta["sha256"]
        cache.fetched_at.append(meta["fetched_at"])
        return parse_archive(content)
    payload = {
        "tool_id": "sig_gutc_tool",
        "name": "Tauchstone GSE132903 report only",
        "data_type": "L1000",
        "dataset": "Touchstone",
        "ignoreWarnings": True,
        "uptag-cmapfile": "GSE132903\t\t" + "\t".join(up) + "\n",
        "dntag-cmapfile": "GSE132903\t\t" + "\t".join(down) + "\n",
    }
    result = cache.post(URL, payload, headers={"user_key": key})
    result = result.get("result", result)
    job_id = result["job_id"]
    # CLUE queues jobs; 45 minutes covers a busy queue. Re-running reuses the cached job.
    deadline = time.monotonic() + 2700
    with httpx.Client(headers={"user_key": key}, timeout=180) as client:
        while result.get("download_status") != "completed":
            if time.monotonic() >= deadline:
                raise TimeoutError(f"CLUE job {job_id} still pending after 2700 seconds")
            if result.get("status") in {"failed", "error"}:
                raise ValueError(f"CLUE job {job_id} failed")
            time.sleep(5)
            url = f"{URL}/findByJobId/{job_id}"
            response = client.get(url)
            cache.record("poll.json", redact(response.content, {"user_key": key}), url)
            response.raise_for_status()
            body = response.json()
            result = body.get("result", body)
        url = result["download_url"]
    if url.startswith("//"):
        url = "https:" + url
    # The credential belongs to api.clue.io, never to the download host.
    response = httpx.get(url, timeout=180, follow_redirects=True)
    path = cache.record("results.tar.gz", response.content, url)
    metadata_path = path.with_name(path.name + ".meta.json")
    metadata = json.loads(metadata_path.read_text())
    metadata["query_sha256"] = query_hash
    metadata["http_status"] = response.status_code
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    response.raise_for_status()
    return parse_archive(response.content)
