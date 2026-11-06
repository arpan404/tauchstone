"""Freeze the offline demo bundle: copy exactly the processed files the API reads
in real mode (see services/api/app/services/repository.py) into data/demo/processed/.

Reads $TS_DATA_DIR/processed, writes <repo>/data/demo/processed + MANIFEST.json.
data/demo/* is gitignored except README.md: the bundle is built, not committed.

Usage:
    python3 scripts/make_demo_bundle.py [--ts-data-dir DIR] [--demo-dir DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Exact files the ParquetRepository reads in real mode (traced from repository.py):
#  get_signature  -> signatures/{cohort}__{variant}.parquet,
#                    signatures/{cohort}__samples.parquet, lincs/landmark_order.parquet
#  list_candidates -> scores/GSE132903__main__candidate_pool.parquet,
#                    scores/GSE132903__main__context_scores.parquet (split in ranking/held_out),
#                    evidence/approval.parquet,
#                    scores/GSE132903__gold_permctl__permutation_null.parquet.provenance.json (theta)
#  get_evidence   -> scores/...candidate_pool.parquet, evidence/{targets,brain_expression,
#                    ad_association,exposure,structures,approval}.parquet,
#                    evidence/<local_path> .cif files
#  get_attack_world -> tauchstone/truth_table.parquet,
#                    scores/...context_scores.parquet, candidate pool,
#                    data/manifests/preregistration.yaml (baked into the api image, not the bundle)
#  get_benchmark  -> tauchstone/benchmark_summary.json
# Plus every .provenance.json sidecar that exists for the files above.
#
# Held-out cohort signatures (GSE173955, GSE53697 main + samples) are included:
# the API serves them after a session reveals the cohort, so the demo needs them.
# Composition-adjusted exists only for GSE132903.
SIGNATURE_STEMS = [
    "GSE132903__main",
    "GSE132903__composition_adjusted",
    "GSE132903__samples",
    "GSE173955__main",
    "GSE173955__samples",
    "GSE53697__main",
    "GSE53697__samples",
]

SCORE_FILES = [
    "GSE132903__main__candidate_pool.parquet",
    "GSE132903__main__context_scores.parquet",  # 3.5 MB: kept whole, no filtering needed
    "GSE132903__main__compound_ranking.parquet",
]

EVIDENCE_FILES = [
    "targets.parquet",
    "brain_expression.parquet",
    "ad_association.parquet",
    "exposure.parquet",
    "structures.parquet",
    "approval.parquet",
    "drug_map.parquet",  # not read by the API today; tiny, kept for completeness
]

TAUCHSTONE_FILES = [
    "truth_table.parquet",
    "benchmark_summary.json",
]

# Only the theta sidecar: the API reads parameters.theta from this provenance file,
# never the 26 MB permutation_null.parquet itself.
PERM_THETA_SIDECAR = (
    "scores/GSE132903__gold_permctl__permutation_null.parquet.provenance.json"
)


def copy_with_sidecar(src_dir: Path, rel: str, dst_dir: Path, out: list[Path]) -> None:
    src = src_dir / rel
    if not src.exists():
        print(f"FATAL: required file missing: {src}", file=sys.stderr)
        raise SystemExit(1)
    dst = dst_dir / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    out.append(dst)
    sidecar = src.parent / (src.name + ".provenance.json")
    if sidecar.exists():
        shutil.copy2(sidecar, dst.parent / (dst.name + ".provenance.json"))
        out.append(dst.parent / (dst.name + ".provenance.json"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ts-data-dir", default=None)
    ap.add_argument("--demo-dir", default=str(REPO / "data" / "demo"))
    args = ap.parse_args()

    import os

    ts = Path(args.ts_data_dir or os.environ.get("TS_DATA_DIR")
              or Path.home() / "Data" / "tauchstone")
    processed = ts / "processed"
    if not processed.is_dir():
        print(f"FATAL: no processed dir: {processed}", file=sys.stderr)
        raise SystemExit(1)

    demo = Path(args.demo_dir)
    demo_processed = demo / "processed"
    if demo_processed.exists():
        shutil.rmtree(demo_processed)
    demo_processed.mkdir(parents=True)

    copied: list[Path] = []
    for stem in SIGNATURE_STEMS:
        copy_with_sidecar(processed, f"signatures/{stem}.parquet", demo_processed, copied)
    for name in SCORE_FILES:
        copy_with_sidecar(processed, f"scores/{name}", demo_processed, copied)
    copy_with_sidecar(processed, "lincs/landmark_order.parquet", demo_processed, copied)
    for name in EVIDENCE_FILES:
        copy_with_sidecar(processed, f"evidence/{name}", demo_processed, copied)
    for name in TAUCHSTONE_FILES:
        copy_with_sidecar(processed, f"tauchstone/{name}", demo_processed, copied)

    # Optional exploratory panel. Existing bundles still work before it is built.
    if (processed / "singlecell/panel.json").is_file():
        copy_with_sidecar(processed, "singlecell/panel.json", demo_processed, copied)

    # Theta sidecar (provenance JSON only, not the 26 MB null distribution).
    sidecar_src = processed / PERM_THETA_SIDECAR
    if not sidecar_src.exists():
        print(f"FATAL: required file missing: {sidecar_src}", file=sys.stderr)
        raise SystemExit(1)
    sidecar_dst = demo_processed / PERM_THETA_SIDECAR
    sidecar_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sidecar_src, sidecar_dst)
    copied.append(sidecar_dst)

    # All structure .cif files (evidence/<local_path>, e.g. evidence/structures/XXXX.cif).
    cif_src_dir = processed / "evidence" / "structures"
    cif_dst_dir = demo_processed / "evidence" / "structures"
    cif_dst_dir.mkdir(parents=True, exist_ok=True)
    cifs = sorted(cif_src_dir.glob("*.cif"))
    if not cifs:
        print(f"FATAL: no .cif files in {cif_src_dir}", file=sys.stderr)
        raise SystemExit(1)
    for cif in cifs:
        shutil.copy2(cif, cif_dst_dir / cif.name)
        copied.append(cif_dst_dir / cif.name)

    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=REPO
        ).stdout.strip()
    except OSError:
        commit = "unknown"

    manifest = []
    total = 0
    for path in sorted(copied):
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        size = path.stat().st_size
        total += size
        manifest.append({
            "path": str(path.relative_to(demo)),
            "sha256": h.hexdigest(),
            "size": size,
        })
    (demo / "MANIFEST.json").write_text(json.dumps(
        {"git_commit": commit, "n_files": len(manifest),
         "total_bytes": total, "files": manifest}, indent=2) + "\n")

    print(f"bundle: {len(manifest)} files, {total / 1e6:.1f} MB -> {demo}")
    print(f"commit: {commit or 'unknown'}")
    ctx = demo_processed / "scores/GSE132903__main__context_scores.parquet"
    print(f"context_scores kept whole: {ctx.stat().st_size / 1e6:.1f} MB "
          f"(small enough; no pool filtering applied)")
    if total > 300e6:
        print(f"WARNING: bundle exceeds 300 MB target ({total / 1e6:.1f} MB)",
              file=sys.stderr)


if __name__ == "__main__":
    main()
