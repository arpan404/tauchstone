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
#                    evidence/approval.parquet, evidence/withdrawn.parquet,
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
    # Read by pipelines/tauchstone/adhoc.py only when an ad-hoc test runs, i.e. after the
    # experiment is committed. Never used for ranking, theta or candidate choice.
    "GSE173955__main__compound_ranking.parquet",
    "GSE132903__composition_adjusted__compound_ranking.parquet",
]

# Live screening (pipelines/lincs/screen_job.py) and lookup (pipelines/evidence/lookup.py).
LINCS_META = [
    "context_split.parquet",
    "landmark_order.parquet",
    "genes.parquet",
    "compounds.parquet",
]
LINCS_ARRAYS = ["level5_landmark_f32.npy", "order_i16.npy", "rank_i16.npy"]
OT_COLUMNS = ["id", "name", "synonyms", "tradeNames", "parentId"]

EVIDENCE_FILES = [
    "targets.parquet",
    "brain_expression.parquet",
    "ad_association.parquet",
    "exposure.parquet",
    "structures.parquet",
    "approval.parquet",
    "withdrawn.parquet",  # ChEMBL 37 withdrawn flag, display only
    "drug_map.parquet",  # candidate pool for live screens + lookup
    "gaps.parquet",
    "cell_lines.parquet",  # cell-line cards (Cellosaurus CC BY 4.0 + LINCS metadata)
]

TAUCHSTONE_FILES = [
    "truth_table.parquet",
    "benchmark_summary.json",
]

# Exploratory structure model: predictions.parquet answers stored lookups, model.joblib
# estimates structures outside it, report.json feeds the "About this estimate" panel.
MODEL_FILES = ["predictions.parquet", "model.joblib", "report.json"]

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


def write_gold_lincs(src: Path, dst: Path) -> list[Path]:
    """Keep only LINCS gold rows. screen_job.py scores gold rows only, so the sliced
    arrays give the same ranking at ~0.37x the size (checked by scripts/offline_check.sh)."""
    import numpy as np
    import pandas as pd

    sys.path.insert(0, str(REPO))
    from pipelines.common.provenance import Provenance
    from pipelines.lincs.rank import gold_mask

    dst.mkdir(parents=True, exist_ok=True)
    info = pd.read_parquet(src / "sig_info.parquet")
    keep = np.flatnonzero(gold_mask(info))
    out = []
    path = dst / "sig_info.parquet"
    info.iloc[keep].reset_index(drop=True).to_parquet(path, index=False)
    out.append(path)
    for name in LINCS_ARRAYS:
        arr = np.load(src / name, mmap_mode="r")
        path = dst / name
        np.save(path, np.ascontiguousarray(arr[keep]))
        out.append(path)
    for path in list(out):
        Provenance(step="demo_bundle_gold_slice", dataset_accession="GSE92742, GSE70138",
                   parameters={"source": f"processed/lincs/{path.name}", "rows": int(len(keep)),
                               "filter": "pipelines.lincs.rank.gold_mask"}).write(path)
        out.append(path.parent / (path.name + ".provenance.json"))
    print(f"lincs gold slice: {len(keep):,} of {len(info):,} signatures")
    return out


def write_ot_synonyms(dst: Path) -> list[Path]:
    """Five-column copy of the Open Targets drug_molecule table (brand/salt names)."""
    import pandas as pd

    sys.path.insert(0, str(REPO))
    from pipelines.common.provenance import Provenance
    from pipelines.evidence._common import OT_DIR, OT_RELEASE

    files = sorted(OT_DIR.glob("drug_molecule*/*.parquet"))
    if not files:
        print("WARNING: Open Targets drug_molecule not downloaded; lookup loses synonyms",
              file=sys.stderr)
        return []
    frame = pd.concat([pd.read_parquet(f, columns=OT_COLUMNS) for f in files], ignore_index=True)
    path = dst / "ot_drug_molecule.parquet"
    frame.to_parquet(path, index=False)
    Provenance(step="demo_bundle_ot_synonyms", dataset_accession=f"Open Targets {OT_RELEASE}",
               parameters={"columns": OT_COLUMNS}).write(path)
    return [path, path.parent / (path.name + ".provenance.json")]


def write_example_signature(processed: Path, demo: Path) -> Path | None:
    """Upload example for the live-screen demo: gene, log2fc, stat, fdr from the GSE173955
    signature. The upload is ranked as a separate, not-preregistered project."""
    import pandas as pd

    sig = processed / "signatures/GSE173955__main.parquet"
    if not sig.exists():
        return None
    frame = pd.read_parquet(sig)
    cols = {c.lower(): c for c in frame.columns}
    gene = cols.get("symbol") or cols.get("entrez_id")
    pick = {"gene": gene, "log2fc": cols.get("log2fc") or cols.get("logfc"),
            "stat": cols.get("stat") or cols.get("t"), "fdr": cols.get("fdr") or cols.get("padj")
            or cols.get("adj_p_val")}
    if not all(pick[k] for k in ("gene", "log2fc", "fdr")):
        print(f"WARNING: example signature skipped; columns {list(frame.columns)}", file=sys.stderr)
        return None
    out = frame[[v for v in pick.values() if v]].rename(columns={v: k for k, v in pick.items() if v})
    path = demo / "example_signature.csv"
    out.dropna(subset=["gene", "log2fc", "fdr"]).to_csv(path, index=False)
    return path


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

    if (processed / "resources/agreement.parquet").is_file():
        copy_with_sidecar(processed, "resources/agreement.parquet", demo_processed, copied)

    # Structure model behind the AI estimate on My compounds (GET /lab/model,
    # POST /compounds/estimate). Checksums are verified against the sidecars at
    # load time, so the sidecars travel with the files.
    for name in MODEL_FILES:
        src = processed / f"models/exploratory/{name}"
        if src.is_file():
            copy_with_sidecar(processed, f"models/exploratory/{name}", demo_processed, copied)
        else:
            print(f"note: no {name}; the AI estimate column stays hidden in this bundle")

    # Cell-line photos (Human Protein Atlas, CC BY 4.0), served by /cell-lines/{id}/image.
    img_src = processed / "evidence" / "cell_line_images"
    img_dst = demo_processed / "evidence" / "cell_line_images"
    img_dst.mkdir(parents=True, exist_ok=True)
    for img in sorted(img_src.glob("*.jpg")):
        shutil.copy2(img, img_dst / img.name)
        copied.append(img_dst / img.name)

    mol_src = processed / "evidence" / "molecules"
    mol_dst = demo_processed / "evidence" / "molecules"
    mol_dst.mkdir(parents=True, exist_ok=True)
    for mol in sorted(mol_src.glob("*.json")):
        shutil.copy2(mol, mol_dst / mol.name)
        copied.append(mol_dst / mol.name)

    for name in LINCS_META:
        if name != "landmark_order.parquet":  # already copied above
            copy_with_sidecar(processed, f"lincs/{name}", demo_processed, copied)
    copied += write_gold_lincs(processed / "lincs", demo_processed / "lincs")
    copied += write_ot_synonyms(demo_processed / "evidence")

    # The API container mounts data/demo read-only; compose puts a tmpfs here for the
    # project store. The directory must exist so Docker can mount over it.
    (demo / "app").mkdir(exist_ok=True)
    example = write_example_signature(processed, demo)
    if example:
        copied.append(example)

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
    if total > 1.5e9:
        print(f"WARNING: bundle exceeds 1.5 GB target ({total / 1e6:.1f} MB)",
              file=sys.stderr)


if __name__ == "__main__":
    main()
