"""Read-only raw readers and deterministic marker pseudobulk preparation."""

import csv
import gzip
from pathlib import Path

import h5py
import numpy as np
from scipy import sparse

MARKERS = {
    "excitatory_neurons": ["SLC17A7", "SATB2"],
    "inhibitory_neurons": ["GAD1", "GAD2"],
    "astrocytes": ["AQP4", "GFAP", "SLC1A2"],
    "microglia": ["CSF1R", "P2RY12", "CX3CR1"],
    "oligodendrocytes": ["MBP", "MOBP", "PLP1"],
    "opc": ["PDGFRA", "VCAN"],
}


def series_samples(path: Path) -> list[dict]:
    rows = []
    with gzip.open(path, "rt") as f:
        for row in csv.reader(f, delimiter="\t"):
            if row and row[0].startswith("!Sample_"):
                rows.append(row)
    ids = next(r[1:] for r in rows if r[0] == "!Sample_geo_accession")
    samples = []
    for i, gsm in enumerate(ids, 1):
        sample = {
            "sample_id": gsm,
            "donor": "unspecified",
            "diagnosis": "unspecified",
            "region": "unspecified",
            "sex": "unspecified",
            "age": "unspecified",
            "pmi": "unspecified",
            "rin": "unspecified",
            "batch": "unspecified",
        }
        for row in rows:
            if row[0] == "!Sample_title":
                sample["title"] = row[i]
            if row[0] == "!Sample_characteristics_ch1" and ": " in row[i]:
                key, val = row[i].split(": ", 1)
                sample[key.lower()] = val
        state = sample.get("disease state", "").lower()
        title = sample["title"].lower()
        if state == "control" or (not state and "control" in title):
            sample["diagnosis"] = "control"
        elif state == "seoad" or (not state and "_ad " in title):
            sample["diagnosis"] = "AD"
        sample["region"] = {"Prefrontal cortex": "PFC", "Entorhinal cortex": "EC", "Hippocampus": "HIP"}.get(
            sample.get("tissue"), "unspecified"
        )
        samples.append(sample)
    return samples


def read_h5(path: Path):
    with h5py.File(path) as f:
        m = f["matrix"]
        counts = sparse.csc_matrix((m["data"][:], m["indices"][:], m["indptr"][:]), shape=tuple(m["shape"][:]))
        names = [v.decode() for v in m["features/name"][:]]
        ensembl = [v.decode() for v in m["features/id"][:]]
        if "feature_type" in m["features"]:
            keep = m["features/feature_type"][:] == b"Gene Expression"
            counts = counts[keep]
            names = [s for s, k in zip(names, keep, strict=True) if k]
            ensembl = [s for s, k in zip(ensembl, keep, strict=True) if k]
    return counts, names, ensembl


def pseudobulk(counts, symbols):
    """Min 200 genes, <=5% MT counts; marker winner >=1.5x runner-up, mean >=1 UMI."""
    total = np.asarray(counts.sum(axis=0)).ravel()
    genes = np.asarray((counts > 0).sum(axis=0)).ravel()
    mt = np.asarray(counts[[s.upper().startswith("MT-") for s in symbols]].sum(axis=0)).ravel()
    qc = (genes >= 200) & (mt / np.maximum(total, 1) <= 0.05)
    scores = np.vstack(
        [
            np.asarray(counts[[s in markers for s in symbols]].sum(axis=0)).ravel() / len(markers)
            for markers in MARKERS.values()
        ]
    )
    order = np.sort(scores, axis=0)
    clear = (order[-1] >= 1) & (order[-1] >= 1.5 * np.maximum(order[-2], 1e-12))
    labels = scores.argmax(axis=0)
    out = {}
    for i, cell_type in enumerate(MARKERS):
        keep = qc & clear & (labels == i)
        n = int(keep.sum())
        if n >= 20:
            out[cell_type] = (np.asarray(counts[:, keep].sum(axis=1)).ravel(), n)
    return out
