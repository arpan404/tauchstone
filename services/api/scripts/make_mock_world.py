"""Generate contracts/fixtures/mock_world.json (fixed seed 20261105).

Mock candidates are NEVER real drug names ('Mock compound NN' / MOCK-NNNN) so mock
output can never be mistaken for a result. Provenance accession is 'MOCK'.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

SEED = 20261105
N_GENES_PRIMARY = 2000
N_GENES_HELDOUT = 1600
N_CANDIDATES = 50
THETA = -1.05  # mock reversal threshold (5th-percentile style cutoff)
CELL_LINES = ["A375", "A549", "HA1E", "HCC515", "HEPG2", "HT29", "MCF7", "PC3", "VCAP"]
DOSES = ["0.04 uM", "0.12 uM", "0.37 uM", "1.11 uM", "3.33 uM", "10 uM"]
TIMES = ["6 h", "24 h"]
PROV = {
    "dataset_accession": "MOCK",
    "processing_version": "mock-0.1",
    "git_commit": "mock",
    "timestamp": "2026-11-06T00:00:00Z",
    "random_seed": SEED,
}

REAL_POOL = [
    "APP", "PSEN1", "MAPT", "APOE", "TREM2", "CLU", "CR1", "PICALM", "BIN1", "ABCA7",
    "MS4A6A", "CD33", "EPHA1", "SORL1", "GAPDH", "ACTB", "RBFOX3", "SYN1", "NEFL",
    "SNAP25", "SYT1", "GRIN2B", "CAMK2A", "ARC", "FOS", "EGR1", "BDNF", "NPTX2",
    "VGF", "SST", "GFAP", "CD44", "SERPINA3", "AQP4", "SLC1A2", "ALDH1L1", "C1QA",
    "C1QB", "TYROBP", "SPI1", "MEF2C", "PU.1", "MBP", "MOBP", "PLP1", "OLIG2",
    "PDGFRA", "DCX", "STMN2", "GAD1", "GAD2", "PVALB", "CALB1", "RGS4", "ENC1",
]
SIGN_FORCED = {
    "GFAP": 3.2, "CD44": 2.8, "SERPINA3": 2.5,
    "SST": -3.0, "VGF": -3.4, "NPTX2": -2.6, "BDNF": -2.2,
}


def _symbols(rng: np.random.Generator, n: int) -> list[str]:
    prefixes = ["ZNF", "KIAA", "LINC", "MIR", "OR", "FAM", "C", "LOC"]
    out = list(REAL_POOL)
    i = 0
    while len(out) < n:
        p = prefixes[i % len(prefixes)]
        out.append(f"{p}{1000 + i * 7}")
        i += 1
    return out[:n]


def _bh_fdr(p: np.ndarray) -> np.ndarray:
    n = len(p)
    order = np.argsort(p)
    ranked = np.empty(n)
    ranked[order] = (p[order] * n) / (np.arange(n) + 1)
    fdr = np.empty(n)
    fdr[order] = np.minimum.accumulate(ranked[order][::-1])[::-1].clip(max=1.0)
    return fdr


def _signature(rng: np.random.Generator, n: int, shift: float = 0.0) -> list[dict]:
    stat = rng.normal(0.0, 1.2, n) + shift
    n_de = min(250, n // 8)
    up_idx = rng.choice(n, n_de, replace=False)
    dn_idx = rng.choice(np.setdiff1d(np.arange(n), up_idx), n_de, replace=False)
    stat[up_idx] = rng.uniform(2.0, 6.0, n_de)
    stat[dn_idx] = rng.uniform(-6.0, -2.0, n_de)
    symbols = _symbols(rng, n)
    entrez_pool = rng.choice(np.arange(1, 25000), n, replace=False)
    for sym, forced in SIGN_FORCED.items():
        if sym in symbols:
            stat[symbols.index(sym)] = forced + rng.normal(0, 0.1)
    log2fc = stat * 0.35 + rng.normal(0, 0.1, n)
    p = np.array([math.erfc(abs(s) / math.sqrt(2)) for s in stat])
    fdr = _bh_fdr(p)
    genes = [
        {
            "entrez_id": str(int(entrez_pool[i])),
            "symbol": symbols[i],
            "log2fc": round(float(log2fc[i]), 4),
            "stat": round(float(stat[i]), 4),
            "p_value": float(p[i]),
            "fdr": float(fdr[i]),
            "query_set": None,
        }
        for i in range(n)
    ]
    # Query sets (algorithms section 2): top 150 by stat among fdr<0.05 & stat>0, mirror.
    up = sorted([g for g in genes if g["fdr"] < 0.05 and g["stat"] > 0],
                key=lambda g: (-g["stat"], g["p_value"], g["entrez_id"]))[:150]
    dn = sorted([g for g in genes if g["fdr"] < 0.05 and g["stat"] < 0],
                key=lambda g: (g["stat"], g["p_value"], g["entrez_id"]))[:150]
    if len(up) < 10:
        up = sorted([g for g in genes if g["stat"] > 0],
                    key=lambda g: (-g["stat"], g["p_value"], g["entrez_id"]))[:150]
    if len(dn) < 10:
        dn = sorted([g for g in genes if g["stat"] < 0],
                    key=lambda g: (g["stat"], g["p_value"], g["entrez_id"]))[:150]
    for g in up:
        g["query_set"] = "up"
    for g in dn:
        g["query_set"] = "down"
    return genes


def _sig_doc(cohort, variant, method, tissue, n_ad, n_control, genes, platform=None):
    return {
        "cohort": cohort, "variant": variant, "method": method, "tissue": tissue,
        "platform": platform, "n_ad": n_ad, "n_control": n_control,
        "n_fdr05": sum(1 for g in genes if g["fdr"] < 0.05),
        "genes": genes, "provenance": dict(PROV, step="mock-signature"),
    }


def main() -> None:
    rng = np.random.default_rng(SEED)
    genes_primary = _signature(rng, N_GENES_PRIMARY)
    genes_adjusted = [
        dict(g, stat=round(g["stat"] * 0.9 + rng.normal(0, 0.15), 4)) for g in genes_primary
    ]
    up_ids = {g["entrez_id"] for g in genes_primary if g["query_set"] == "up"}
    dn_ids = {g["entrez_id"] for g in genes_primary if g["query_set"] == "down"}
    for g in genes_adjusted:  # keep query sets identical to main
        g["query_set"] = "up" if g["entrez_id"] in up_ids else ("down" if g["entrez_id"] in dn_ids else None)
    genes_h1 = _signature(rng, N_GENES_HELDOUT, shift=0.05)
    genes_h2 = _signature(rng, N_GENES_HELDOUT, shift=-0.05)

    signatures = {
        "GSE132903__main": _sig_doc("GSE132903", "main", "limma", "middle temporal gyrus",
                                    97, 98, genes_primary, platform="Illumina HT-12 v4"),
        "GSE132903__composition_adjusted": _sig_doc(
            "GSE132903", "composition_adjusted", "limma", "middle temporal gyrus",
            97, 98, genes_adjusted, platform="Illumina HT-12 v4"),
        "GSE173955__main": _sig_doc("GSE173955", "main", "limma-trend", "hippocampus",
                                    8, 10, genes_h1, platform="RNA-seq TPM"),
        "GSE53697__main": _sig_doc("GSE53697", "main", "deseq2", "unspecified",
                                   9, 8, genes_h2, platform="RNA-seq counts"),
    }

    # -- candidates ------------------------------------------------------
    base = np.linspace(-2.6, -0.35, N_CANDIDATES) + rng.normal(0, 0.05, N_CANDIDATES)
    order = np.argsort(base)  # rank 1 = most negative
    candidates, evidence, truth, rank_obs = [], {}, {}, {}
    appr_cycle = ["approved", "investigational", "preclinical", "unknown"]
    for pos, idx in enumerate(order):
        rank = pos + 1
        cid = f"MOCK-{idx + 1:04d}"
        name = f"Mock compound {idx + 1:02d}"
        cons = round(float(base[idx]), 3)
        n_rank = int(rng.integers(3, 15))
        n_held = int(rng.integers(1, 9))
        wtcs = round(cons + rng.normal(0, 0.08), 3)
        ks = round(cons + rng.normal(0, 0.08), 3)
        cos = round(cons + rng.normal(0, 0.08), 3)
        n_cells = int(rng.integers(3, 10))
        cells = sorted(rng.choice(CELL_LINES, n_cells, replace=False).tolist())
        per = [n_rank // n_cells + (1 if j < n_rank % n_cells else 0) for j in range(n_cells)]
        by_cell = [
            {"cell_id": c, "consensus": round(cons + rng.normal(0, 0.15), 3), "n_contexts": p}
            for c, p in zip(cells, per, strict=True)
        ]
        flags = []
        if n_rank < 5:
            flags.append("few_contexts")
        if rng.random() < 0.2:
            flags.append("composition_sensitive")
        candidates.append({
            "id": cid, "rank": rank, "name": name, "consensus": cons,
            "consensus_iqr": [round(cons - 0.25, 3), round(cons + 0.25, 3)],
            "n_ranking_contexts": n_rank, "n_held_out_contexts": n_held,
            "scores": {"wtcs": wtcs, "ks": ks, "cosine": cos},
            "by_cell_line": by_cell,
            "approval_status": {
                "status": appr_cycle[idx % 4],
                "max_phase": [4.0, 2.0, 0.0, None][idx % 4],
                "source": {"label": "ChEMBL MOCK", "url": "https://example.com/chembl/mock"},
            },
            "flags": flags,
            "is_demo_candidate": rank in (1, 5, 12),
        })
        # ranking observations
        obs = []
        for j in range(n_rank):
            cell = cells[j % n_cells]
            cctx = f"{cell}|{DOSES[(idx + j) % 6]}|{TIMES[j % 2]}"
            obs.append({
                "context_id": f"ranking:{cctx}#{j}",
                "label": f"{cell} \u00b7 {DOSES[(idx + j) % 6]} \u00b7 {TIMES[j % 2]}",
                "cell_id": cell, "pert_idose": DOSES[(idx + j) % 6], "pert_itime": TIMES[j % 2],
                "survive": bool((cons + rng.normal(0, 0.3)) <= THETA),
            })
        rank_obs[cid] = obs
        # truth table
        rows = []
        h1v = round(cons + rng.normal(0, 0.5), 3)
        h2v = round(cons + rng.normal(0, 0.5), 3)
        adjv = round(cons * 0.95 + rng.normal(0, 0.3), 3)
        q5 = -1.8
        rows.append({"context_id": "held_out_cohort:GSE173955", "context_type": "held_out_cohort",
                     "label": "GSE173955 hippocampus (RNA-seq)", "value": h1v, "threshold": q5,
                     "outcome": "survive" if h1v <= q5 else "fail",
                     "rule": "compound is in the 5% most-reversing ranked compounds for this cohort query",
                     "tissue": "brain", "region": "hippocampus", "platform": "RNA-seq TPM",
                     "cohort": "GSE173955"})
        rows.append({"context_id": "held_out_cohort:GSE53697", "context_type": "held_out_cohort",
                     "label": "GSE53697 (RNA-seq counts)", "value": h2v, "threshold": q5,
                     "outcome": "survive" if h2v <= q5 else "fail",
                     "rule": "compound is in the 5% most-reversing ranked compounds for this cohort query",
                     "tissue": "brain", "region": "unspecified", "platform": "RNA-seq counts",
                     "cohort": "GSE53697"})
        rows.append({"context_id": "composition_adjusted:GSE132903", "context_type": "composition_adjusted",
                     "label": "GSE132903 composition-adjusted", "value": adjv, "threshold": q5,
                     "outcome": "survive" if adjv <= q5 else "fail",
                     "rule": "compound is in the 5% most-reversing ranked compounds for the adjusted query",
                     "tissue": "brain", "region": "middle temporal gyrus", "platform": "Illumina HT-12 v4"})
        n_lincs = int(min(n_held, rng.integers(2, 7)))
        for _ in range(n_lincs):
            cell = str(rng.choice(CELL_LINES))
            dose = str(rng.choice(DOSES))
            tm = str(rng.choice(TIMES))
            v = round(cons + rng.normal(0, 0.4), 3)
            rows.append({"context_id": f"lincs_context:{cell}|{dose}|{tm}",
                         "context_type": "lincs_context",
                         "label": f"{cell} \u00b7 {dose} \u00b7 {tm} (held-out)",
                         "value": v, "threshold": THETA,
                         "outcome": "survive" if v <= THETA else "fail",
                         "rule": "held-out context consensus <= theta (theta = 5th percentile of permutation null)",
                         "cell_id": cell, "pert_idose": dose, "pert_itime": tm})
        kp = round(float(rng.lognormal(-1.5, 1.0)), 3)
        exp_survive = bool(kp >= 0.1 or rng.random() < 0.1)
        rows.append({"context_id": "brain_exposure:measured", "context_type": "brain_exposure",
                     "label": "measured CNS exposure", "value": kp, "threshold": 0.1,
                     "outcome": "survive" if exp_survive else "fail",
                     "rule": "survive if measured human CNS PK or preclinical brain/plasma Kp >= 0.1 "
                             "or PAMPA-BBB Pe >= 4e-06 cm/s; no measured data = fail"})
        for ct in ["microglia", "astrocyte"][: 1 + idx % 2]:
            v = round(cons + rng.normal(0, 0.6), 3)
            rows.append({"context_id": f"cell_type:{ct}", "context_type": "cell_type",
                         "label": f"{ct} pseudobulk", "value": v, "threshold": q5,
                         "outcome": "survive" if v <= q5 else "fail",
                         "rule": "compound is in the 5% most-reversing ranked compounds for this cell-type query",
                         "tissue": "brain", "region": "cortex", "platform": "RNA-seq"})
        assert 5 <= len(rows) <= 12, len(rows)
        truth[cid] = rows
        # evidence (top 20 only)
        if rank <= 20:
            n_t = int(rng.integers(1, 4))
            targets = []
            for t in range(n_t):
                ent = str(10000 + idx * 10 + t)
                targets.append({
                    "symbol": f"MOCKT{idx + 1:02d}{chr(65 + t)}",
                    "uniprot": f"M0CK{idx + 1:02d}{t}",
                    "entrez_id": ent, "ensembl_id": f"ENSG00000MOCK{idx + 1:02d}{t}",
                    "action_type": ["INHIBITOR", "AGONIST", None][(idx + t) % 3],
                    "brain_expression": [
                        {"context": "cerebral cortex", "kind": "region",
                         "ntpm": round(float(rng.uniform(1, 60)), 2)},
                        {"context": "microglia", "kind": "cell_type",
                         "ntpm": round(float(rng.uniform(0, 20)), 2)},
                    ],
                    "ad_association_score": round(float(rng.uniform(0, 1)), 3),
                    "sources": [{"label": "ChEMBL MOCK", "url": "https://example.com/chembl/mock"}],
                })
            struct = None
            if idx % 2 == 0:
                struct = {"pdb_id": f"MK{idx + 1:02d}", "uniprot": targets[0]["uniprot"],
                          "url": f"/structures/MK{idx + 1:02d}.cif", "method": "X-ray",
                          "resolution_angstrom": 2.1,
                          "note": "Target context only. Not evidence that the drug binds this structure."}
            evidence[cid] = {
                "candidate_id": cid, "name": name, "chembl_id": None,
                "mechanism": f"MOCK mechanism {rank}",
                "targets": targets,
                "approval_status": candidates[-1]["approval_status"],
                "brain_exposure": {
                    "level": "predicted",
                    "summary": "Predicted CNS MPO pass (predicted; measured exposure is hidden "
                               "validation data revealed only by an attack).",
                    "sources": [{"label": "predicted MPO", "url": "https://example.com/mpo/mock"}],
                },
                "structure": struct,
                "boundary": "Research hypothesis only. Not a treatment recommendation. Gene expression "
                            "reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.",
                "provenance": dict(PROV, step="mock-evidence"),
            }

    benchmark = {
        "n_candidates": N_CANDIDATES, "n_seeds": 20, "budget": 5,
        "policies": [
            {"policy": p, "label": lb, "experiments_to_correct_verdict":
             {"median": med, "iqr": [med - 0.5, med + 0.5], "ci95": [med - 1.0, med + 1.0]},
             "fragile_recall_at_3": {"estimate": r3, "ci95": [r3 - 0.1, r3 + 0.1]},
             "fragile_recall_at_5": {"estimate": r5, "ci95": [r5 - 0.1, r5 + 0.1]},
             "decision_accuracy": {"estimate": acc, "ci95": [acc - 0.08, acc + 0.08]},
             "brier": 0.2}
            for p, lb, med, r3, r5, acc in [
                ("random", "Random", 5.0, 0.2, 0.35, 0.5),
                ("greedy_strongest", "Greedy strongest (confirmation bias)", 4.5, 0.15, 0.3, 0.55),
                ("max_failure", "Attack (max failure)", 3.0, 0.6, 0.75, 0.78),
                ("max_uncertainty", "Max uncertainty", 3.5, 0.5, 0.65, 0.72),
                ("expected_decision_change", "Learn (expected decision change)", 3.0, 0.55, 0.7, 0.8),
                ("tauchstone_hybrid", "Tauchstone hybrid", 2.5, 0.65, 0.8, 0.85),
            ]
        ],
        "calibration": [
            {"bin_lo": round(i / 10, 1), "bin_hi": round((i + 1) / 10, 1),
             "mean_predicted": round((i + 0.5) / 10, 2),
             "observed_rate": round(min(0.95, max(0.05, (i + 0.5) / 10 + rng.normal(0, 0.05))), 3),
             "n": int(rng.integers(20, 200))}
            for i in range(10)
        ],
        "tests": [
            {"policy_a": "tauchstone_hybrid", "policy_b": p, "metric": "decision_accuracy",
             "statistic": 120.0 + i, "p_holm": round(0.001 * (i + 1), 4)}
            for i, p in enumerate(["random", "greedy_strongest", "max_failure",
                                   "max_uncertainty", "expected_decision_change"])
        ],
        "preregistration_sha256": "mock" + "0" * 60,
        "preregistration_commit": "mock",
        "provenance": dict(PROV, step="mock-benchmark"),
    }

    world = {
        "provenance": dict(PROV, step="mock-world"),
        "ranking_signature": "GSE132903__main",
        "permutation_control": {"n_permutations": 200, "theta": THETA, "passed": True},
        "signatures": signatures,
        "candidates": candidates,
        "evidence": evidence,
        "truth": truth,
        "ranking_observations": rank_obs,
        "benchmark": benchmark,
    }
    out = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "mock_world.json"
    # path: services/api/scripts/ -> parents[0]=scripts [1]=api [2]=services [3]=root
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(world, f)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
