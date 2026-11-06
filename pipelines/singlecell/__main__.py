"""Isolated exploratory pseudobulk fitting and ranking-context scoring."""

import gzip
import json
import re
import subprocess
import tarfile
import time
from dataclasses import asdict

import numpy as np
import pandas as pd
from scipy.io import mmread

from pipelines.common.paths import PROCESSED, RAW
from pipelines.common.provenance import Provenance, sha256_file
from pipelines.lincs.rank import gold_mask, load_lincs, ranking_mask
from pipelines.lincs.scoring import Scorer, build_query_sets
from pipelines.singlecell.prepare import MARKERS, pseudobulk, read_h5, series_samples

OUT = PROCESSED / "singlecell"
LABEL = "Exploratory, not part of the preregistered benchmark"


def output(name):
    path = OUT / name
    if path.resolve().parent != OUT.resolve():
        raise ValueError("output must stay in processed/singlecell")
    return path


def main():
    start = time.monotonic()
    OUT.mkdir(parents=True, exist_ok=True)
    inputs, rows, vectors, features = {}, [], [], None
    for cohort in ("GSE272082", "GSE175814"):
        raw = RAW / "geo" / cohort
        matrix = raw / (
            f"{cohort}-GPL34281_series_matrix.txt.gz" if cohort == "GSE272082" else f"{cohort}_series_matrix.txt.gz"
        )
        inputs[str(matrix)] = sha256_file(matrix)
        archive = tarfile.open(raw / "GSE175814_RAW.tar") if cohort == "GSE175814" else None
        if archive:
            inputs[str(raw / "GSE175814_RAW.tar")] = sha256_file(raw / "GSE175814_RAW.tar")
        for sample in series_samples(matrix):
            if cohort == "GSE272082":
                if "GEX" not in sample["title"]:
                    continue
                path = next(raw.glob(sample["sample_id"] + "_*.h5"))
                counts, symbols, ensembl = read_h5(path)
                inputs[str(path)] = sha256_file(path)
                number = int(re.search(r"NIH(\d+)", path.name)[1])
                donor = next(str(base) for base in (1, 4, 10, 13, 16, 28) if base <= number <= base + 2)
                region = sample["region"]
            else:
                prefix = sample["sample_id"]
                members = [m for m in archive.getmembers() if m.name.startswith(prefix)]

                def member(suffix, archive=archive, members=members):
                    return archive.extractfile(next(m for m in members if m.name.endswith(suffix)))

                counts = mmread(gzip.GzipFile(fileobj=member("matrix.mtx.gz"))).tocsc()
                table = pd.read_csv(gzip.GzipFile(fileobj=member("features.tsv.gz")), sep="\t", header=None)
                ensembl, symbols = table[0].tolist(), table[1].tolist()
                donor, region = prefix, None
            bulks = pseudobulk(counts, symbols)
            print(cohort, sample["sample_id"], {k: n for k, (_, n) in bulks.items()}, flush=True)
            if features is None:
                features = pd.DataFrame({"symbol": symbols, "ensembl": ensembl})
            for cell, (vector, n) in bulks.items():
                key = "|".join(filter(None, [cohort, region, cell]))
                # Cohorts can have different feature spaces; only GSE272082 is fitted.
                column = f"s{len(vectors)}"
                if cohort == "GSE272082":
                    assert ensembl == features.ensembl.tolist()
                    vectors.append(vector)
                rows.append(
                    dict(
                        signature_id=key,
                        cohort=cohort,
                        region=region,
                        cell_type=cell,
                        donor=donor,
                        diagnosis=sample["diagnosis"],
                        n_nuclei=n,
                        column=column,
                    )
                )
        if archive:
            archive.close()
    meta = pd.DataFrame(rows)
    features.to_csv(output("genes.tsv"), sep="\t", index=False)
    pd.DataFrame(np.stack(vectors, axis=1), columns=[f"s{i}" for i in range(len(vectors))]).to_csv(
        output("counts.tsv"), sep="\t", index=False
    )
    meta.to_csv(output("pseudobulk_samples.tsv"), sep="\t", index=False)
    subprocess.run(["Rscript", "pipelines/singlecell/fit.R", str(OUT)], check=True)
    signatures, queries = [], {}
    for cohort, regions in [("GSE272082", ["PFC", "EC", "HIP"]), ("GSE175814", [None])]:
        for region in regions:
            for cell in MARKERS:
                key = "|".join(filter(None, [cohort, region, cell]))
                s = meta[meta.signature_id == key]
                ad = s.loc[s.diagnosis == "AD", "donor"].nunique()
                control = s.loc[s.diagnosis == "control", "donor"].nunique()
                ok = min(ad, control) >= 3
                q = (
                    pd.read_csv(output(key.replace("|", "__") + ".tsv"), sep="\t", dtype={"entrez_id": str})
                    if ok
                    else None
                )
                if ok:
                    queries[key] = q
                signatures.append(
                    dict(
                        signature_id=key,
                        cohort=cohort,
                        region=region,
                        cell_type=cell,
                        n_donors_ad=ad,
                        n_donors_control=control,
                        n_nuclei=int(s.n_nuclei.sum()),
                        n_genes_tested=len(q) if ok else None,
                        n_fdr05=int((q.fdr < 0.05).sum()) if ok else None,
                        status="ok" if ok else "insufficient_donors",
                    )
                )
    pool = pd.read_parquet(PROCESSED / "scores/GSE132903__main__candidate_pool.parquet")
    print("pool columns", pool.columns.tolist(), flush=True)
    pool = pool[pool.pool == "benchmark"].sort_values("pool_rank").head(20)
    drugs = [
        dict(
            candidate_id=r.pert_id,
            name=r.pert_iname,
            pool_rank=int(r.pool_rank),
            bulk_consensus=float(r.consensus_median),
            scores=[],
        )
        for r in pool.itertuples()
    ]
    lincs = load_lincs(block=2000)
    mask = ranking_mask(lincs["sig_info"], lincs["split"]) & gold_mask(lincs["sig_info"])
    info = lincs["sig_info"][mask].reset_index(drop=True)
    scorer = Scorer(lincs["X"][mask], lincs["scorer"].order[mask], lincs["scorer"].rank[mask], block=2000)
    query_details = {}
    for sig in signatures:
        key = sig["signature_id"]
        agg = None
        if key in queries:
            sets = build_query_sets(queries[key], lincs["landmark"])
            res = scorer.score(sets, ranking_mask=np.ones(len(info), dtype=bool))
            scores = info[["pert_id", "context_id"]].copy()
            for method in ("consensus", "wtcs", "ks", "cosine"):
                scores[method] = res[method]
            agg = scores.groupby(["pert_id", "context_id"]).mean().groupby("pert_id").median()
            query_details[key] = dict(
                fallback=sets.fdr_fallback,
                n_up=sets.n_up,
                n_down=sets.n_down,
                sign_checks=queries[key]
                .loc[queries[key].symbol.isin(["GFAP", "SST", "VGF"]), ["symbol", "stat", "fdr"]]
                .to_dict("records"),
            )
        for drug in drugs:
            r = agg.loc[drug["candidate_id"]] if agg is not None else None
            drug["scores"].append(
                dict(
                    signature_id=key,
                    consensus=float(r.consensus) if r is not None else None,
                    scores={m: float(r[m]) for m in ("wtcs", "ks", "cosine")} if r is not None else None,
                )
            )
    prov = Provenance(
        step="singlecell_exploratory",
        dataset_accession=["GSE272082", "GSE175814"],
        inputs=inputs,
        random_seed=20261105,
        model="~group; limma-voom AD minus control; TMM; filterByExpr; robust eBayes",
        parameters=dict(
            donor_identity="INFERRED NIH triplets 01-03,04-06,10-12,13-15,16-18,28-30; never pool regions",
            excluded="GPL24676 UT04 UT09 UT2105",
            covariates="unspecified; not modelled at n=3 per group",
            min_genes=200,
            max_mito_fraction=0.05,
            min_nuclei=20,
            marker_mean_min=1,
            marker_ratio_min=1.5,
            markers=MARKERS,
            queries=query_details,
            runtime_seconds=time.monotonic() - start,
            versions=json.loads(output("versions.json").read_text()),
        ),
    )
    panel = dict(
        label=LABEL,
        note=(
            "GSE272082: sporadic early-onset AD (sEOAD) versus control, separate regional models; "
            "inferred donor triplets. GPL24676 excluded for platform/batch confounding. Sex unbalanced "
            "(Control 2M/1F, sEOAD 2F/1M), not modelled. GSE175814 has at most 2 donors per group. "
            "Most fitted signatures have few or no genes at FDR < 0.05; for those the query falls back "
            "to the top-ranked genes regardless of significance, so their scores are weak evidence. "
            "Marker annotation requires human review; negative scores indicate reversal of expression "
            "only. "
        ),
        cell_typing=(
            "Nuclei passing QC receive the canonical marker type with mean raw count at least 1 UMI and "
            "at least 1.5 times the runner-up. "
        ),
        signatures=signatures,
        drugs=drugs,
        provenance=asdict(prov),
    )
    output("panel.json").write_text(json.dumps(panel, indent=2, allow_nan=False) + "\n")
    for path in OUT.iterdir():
        if not path.name.endswith(".provenance.json"):
            prov.write(path)
    print(json.dumps(signatures, indent=2), flush=True)


if __name__ == "__main__":
    main()
