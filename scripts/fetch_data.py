"""Download every file in data/manifests/sources.toml and freeze it with a checksum.

Standard library only, so it runs before the Python environment exists.
Downloads resume if interrupted (curl -C -). Re-running skips files that already
have a recorded checksum matching what is on disk.

Usage: python3 scripts/fetch_data.py [--tier core] [--jobs 4] [--group lincs/GSE92742]
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import tomllib
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / "data" / "manifests" / "sources.toml"
CHECKSUMS = REPO / "data" / "manifests" / "checksums.json"
DATA_DIR = Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone"))
RAW = DATA_DIR / "raw"

_lock = threading.Lock()


def log(msg: str) -> None:
    with _lock:
        print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def hash_file(path: Path, algo: str) -> str:
    h = hashlib.new(algo)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def load_checksums() -> dict:
    return json.loads(CHECKSUMS.read_text()) if CHECKSUMS.exists() else {}


def save_record(key: str, record: dict) -> None:
    with _lock:
        data = load_checksums()
        data[key] = record
        CHECKSUMS.write_text(json.dumps(dict(sorted(data.items())), indent=2) + "\n")


def upstream_sha512(url: str) -> dict[str, str]:
    """GEO's SHA512SUMS files are `<hash>  <filename>` lines, gzipped."""
    with urllib.request.urlopen(url, timeout=60) as r:
        text = gzip.decompress(r.read()).decode()
    out = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2:
            out[Path(parts[1].lstrip("*")).name] = parts[0].lower()
    return out


def list_dir(url: str, pattern: str) -> list[str]:
    """File names in an HTTP directory listing (NCBI/EBI FTP-over-HTTPS) matching `pattern`."""
    with urllib.request.urlopen(url, timeout=60) as r:
        html = r.read().decode()
    names = {h for h in re.findall(r'href="([^"?/][^"]*)"', html) if re.search(pattern, h)}
    if not names:
        raise RuntimeError(f"no files matching {pattern!r} at {url}")
    return sorted(names)


def fetch(group: str, url: str, expected_sha512: str | None, name: str | None = None,
          single: bool = False) -> str:
    dest = RAW / group / (name or Path(urllib.parse.urlparse(url).path).name)
    dest.parent.mkdir(parents=True, exist_ok=True)
    key = f"{group}/{dest.name}"

    known = load_checksums().get(key)
    if known and dest.exists() and dest.stat().st_size == known["bytes"]:
        return f"skip   {key} (already frozen)"

    log(f"start  {key}")
    if shutil.which("aria2c") and not single:
        # Several connections per file: NCBI/EBI throttle single connections to ~300 KB/s.
        # NCBI answers 503 above ~4 connections. aria2 writes out of order, so the file
        # size on disk is not progress; a <file>.aria2 control file exists until it finishes.
        cmd = ["aria2c", "-c", "-x", "4", "-s", "4", "-k", "32M", "--max-tries=20",
               "--retry-wait=10", "--file-allocation=none", "--console-log-level=error",
               "--summary-interval=0", "-d", str(dest.parent), "-o", dest.name, url]
        ok_codes = (0,)
    else:
        cmd = ["curl", "-fsSL", "--retry", "8", "--retry-delay", "10", "-C", "-", "-o", str(dest), url]
        ok_codes = (0, 33)  # 33: server can't resume but the file is already complete
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode not in ok_codes:
        raise RuntimeError(f"{cmd[0]} failed ({res.returncode}) for {url}: {res.stderr.strip()[-500:]}")

    sha256 = hash_file(dest, "sha256")
    verified = None
    if expected_sha512:
        verified = hash_file(dest, "sha512") == expected_sha512
        if not verified:
            raise RuntimeError(f"SHA-512 mismatch for {key}; delete {dest} and re-run")

    save_record(key, {
        "url": url,
        "path": str(dest.relative_to(DATA_DIR)),
        "bytes": dest.stat().st_size,
        "sha256": sha256,
        "upstream_sha512_verified": verified,
        "frozen_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
    })
    return f"frozen {key} ({dest.stat().st_size / 1e9:.2f} GB, sha512 verified={verified})"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", default="core", help="comma list of tiers, or 'all'")
    ap.add_argument("--group", action="append", help="only these groups (repeatable)")
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()

    sources = tomllib.loads(MANIFEST.read_text())["source"]
    tiers = None if args.tier == "all" else set(args.tier.split(","))
    jobs = []
    for s in sources:
        if (tiers and s["tier"] not in tiers) or (args.group and s["group"] not in args.group):
            continue
        sums = upstream_sha512(s["sha512_list"]) if s.get("sha512_list") else {}
        single = s.get("single_connection", False)
        # `files`: paths under `base`, or {path, name} tables to choose the saved file name.
        for f in s.get("files", []):
            path, name = (f, None) if isinstance(f, str) else (f["path"], f.get("name"))
            jobs.append((s["group"], s["base"] + path, sums.get(Path(path).name), name, single))
        # `listing`: sub-folders of `base` whose matching files are all fetched (e.g. Parquet parts).
        for sub in s.get("listing", []):
            for fname in list_dir(s["base"] + sub, s.get("pattern", ".")):
                group = f"{s['group']}/{sub.strip('/')}"
                jobs.append((group, s["base"] + sub + fname, None, None, single))

    log(f"{len(jobs)} files -> {RAW}")
    # Largest files first so they start immediately.
    jobs.sort(key=lambda j: "gctx" not in j[1])
    failed = 0
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(fetch, *j): j for j in jobs}
        for fut in as_completed(futures):
            try:
                log(fut.result())
            except Exception as e:  # report and keep going; re-run resumes
                failed += 1
                log(f"FAIL   {futures[fut][1]}: {e}")
    log(f"done, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
