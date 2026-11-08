"""Timestamped HTTP response cache with SHA-256 and credential-free metadata."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import httpx


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")



def redact(content: bytes, headers: dict | None) -> bytes:
    """Remove any header value (API keys) that a response echoes back."""
    for value in (headers or {}).values():
        if value and len(value) >= 8:
            content = content.replace(value.encode(), b"[redacted]")
    return content

class Cache:
    def __init__(self, root: Path, *, offline: bool = False):
        self.root = root
        self.offline = offline
        self.inputs: dict[str, str] = {}
        self.fetched_at: list[str] = []

    def post(self, url: str, payload: dict, *, headers: dict | None = None) -> dict:
        key = hashlib.sha256(json.dumps([url, payload], sort_keys=True).encode()).hexdigest()
        folder = self.root / key
        matches = sorted(folder.glob("*.meta.json"))
        if matches:
            meta = json.loads(matches[-1].read_text())
            path = folder / meta["file"]
            content = path.read_bytes()
            if hashlib.sha256(content).hexdigest() != meta["sha256"]:
                raise ValueError(f"Cache checksum mismatch: {path}")
        else:
            if self.offline:
                raise FileNotFoundError(f"No cached response for request {key}")
            response = httpx.post(url, json=payload, headers=headers, timeout=180, follow_redirects=True)
            # Services may echo credentials back (CLUE returns user_key); never store them.
            content = redact(response.content, headers)
            timestamp = now()
            digest = hashlib.sha256(content).hexdigest()
            folder.mkdir(parents=True, exist_ok=True)
            stem = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ") + "_" + digest
            path = folder / (stem + ".json")
            path.write_bytes(content)
            meta = {
                "url": url,
                "request": payload,
                "fetched_at": timestamp,
                "sha256": digest,
                "file": path.name,
                "http_status": response.status_code,
            }
            (folder / (stem + ".meta.json")).write_text(json.dumps(meta, indent=2) + "\n")
        self.inputs[str(path)] = meta["sha256"]
        self.fetched_at.append(meta["fetched_at"])
        if meta["http_status"] != 200:
            raise ValueError(f"HTTP {meta['http_status']} from {url}; response cached")
        return json.loads(content)

    def record(self, label: str, content: bytes, url: str) -> Path:
        """Cache downloads and polling responses without request credentials."""
        digest = hashlib.sha256(content).hexdigest()
        self.root.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        path = self.root / f"{stamp}_{digest}_{label}"
        path.write_bytes(content)
        meta = {"url": url, "sha256": digest, "fetched_at": now(), "file": path.name}
        path.with_name(path.name + ".meta.json").write_text(json.dumps(meta, indent=2) + "\n")
        self.inputs[str(path)] = digest
        self.fetched_at.append(meta["fetched_at"])
        return path
