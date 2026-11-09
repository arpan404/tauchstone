# Exploratory single-cell pipeline

Run `make singlecell` from the repository root. The pipeline never writes to raw
files. It writes all outputs and provenance sidecars to
`$TS_DATA_DIR/processed/singlecell/`. The real API reads `panel.json` and returns 404
when the output is missing. Nothing here feeds the frozen benchmark, thresholds,
tuning, candidate selection, truth table or engine.

## Donors and models

GSE272082 uses GPL34281 GEX samples only. Donor identity is **INFERRED** from matching
disease, sex, age and PMI in NIH triplets 01–03, 04–06, 10–12, 13–15, 16–18 and
28–30. The orchestrator approved the inference. Each region has distinct donors:

| Region | Control | sEOAD |
| --- | --- | --- |
| PFC | NIH01, NIH04, NIH28 | NIH10, NIH13, NIH16 |
| EC | NIH02, NIH05, NIH29 | NIH11, NIH14, NIH17 |
| HIP | NIH03, NIH06, NIH30 | NIH12, NIH15, NIH18 |

Never pool regions. Exclude GPL24676 PFC UT04, UT09 and UT2105 because the platform
batch is unbalanced across groups. GSE272082 compares sporadic early-onset AD with
control. Sex is unbalanced, with Control 2M/1F and sEOAD 2F/1M. At n=3 per group the
models use group only. Model covariates are recorded as `unspecified`, never imputed.
GSE175814 has only two samples per group and is never fitted or scored. Its donor
identifiers are its sample accessions, and they make no claim that a donor matches
across cohorts.

## Fixed exploratory method

Each nucleus needs at least 200 detected genes, and its mitochondrial UMIs must be at
most 5% of total UMIs. A nucleus gets the canonical marker type with the largest mean
raw count, provided that mean is at least 1 UMI and at least 1.5 times the runner-up.
Marker lists are in `prepare.py` and in the output provenance. Ambiguous nuclei are
excluded. This simple annotation needs human review. The method has no random step,
but seed 20261105 is still recorded.

Sum raw counts per donor, region and cell type. Drop pseudobulks with fewer than 20
nuclei. If either group keeps fewer than three donors, the result is
`insufficient_donors`, with no model and null scores. Nucleus counts cover retained
pseudobulks only, not the smaller groups that were dropped.

Map symbols with the bulk pipeline's `map_symbols_to_entrez`, using org.Hs.eg.db
SYMBOL first and then ALIAS where it resolves uniquely. When features collide on one
Entrez ID, keep the one with the highest mean raw pseudobulk count across the
GSE272082 samples. Carry symbol and Ensembl alongside string Entrez IDs. Fit each
cohort x region x type separately with edgeR filterByExpr defaults, TMM, limma voom,
`~group` with control first, `groupAD`, robust eBayes and BH FDR. Positive means up
in AD. GFAP, SST and VGF statistics are reported as descriptive sign checks and are
never used to tune the model.

Use the frozen benchmark candidate pool ranks 1–20, in pool order. Read only gold
LINCS ranking contexts, with the existing frozen split and gold criteria.
Standardise wtcs, ks and cosine over all gold ranking signatures, then average the
z scores for consensus. Context means and compound medians follow the bulk method.
Method fields hold raw method medians, and consensus holds the median of context
consensus means. Use `build_query_sets` with top 150 up/down and its recorded FDR
fallback. The panel also carries the frozen pool's bulk consensus for comparison.
No held-out LINCS responses enter this computation.

Intermediate TSV files, fitted signatures, package versions and the final panel all
get provenance sidecars. The panel records raw input SHA-256 checksums, thresholds,
the inferred mapping, exclusions, query fallback flags, sign checks and runtime. The
outputs are exploratory expression comparisons and need human sign-off.
