# Exploratory single-cell pipeline

Run `make singlecell` from the repository root. Raw files are read-only; all outputs
and provenance sidecars go to `$TS_DATA_DIR/processed/singlecell/`. The real API reads
`panel.json`; missing output returns 404. Nothing feeds the frozen benchmark,
thresholds, tuning, candidate selection, truth table or engine.

## Donors and models

GSE272082 uses GPL34281 GEX samples only. Donor identity is **INFERRED**, approved by
the orchestrator from matching disease, sex, age and PMI in NIH triplets 01–03,
04–06, 10–12, 13–15, 16–18 and 28–30. Each region has distinct donors:

| Region | Control | sEOAD |
| --- | --- | --- |
| PFC | NIH01, NIH04, NIH28 | NIH10, NIH13, NIH16 |
| EC | NIH02, NIH05, NIH29 | NIH11, NIH14, NIH17 |
| HIP | NIH03, NIH06, NIH30 | NIH12, NIH15, NIH18 |

Never pool regions. Exclude GPL24676 PFC UT04, UT09 and UT2105 because the platform
batch is unbalanced across groups. GSE272082 compares sporadic early-onset AD
with control. Sex is unbalanced, Control 2M/1F and sEOAD 2F/1M. Models use group
only at n=3 per group; model covariates are recorded as `unspecified`, never
imputed. GSE175814 has only two samples per group and is never fitted or scored.
Its donor identifiers use sample accessions, without claiming cross-cohort identity.

## Fixed exploratory method

Per nucleus require at least 200 detected genes and mitochondrial UMIs at most
5% of total UMIs. Assign the canonical marker type with largest mean raw count,
requiring mean at least 1 UMI and at least 1.5 times the runner-up. Marker lists
are in `prepare.py` and output provenance. Ambiguous nuclei are excluded. This
simple annotation requires human review. No random operation is used; seed
20261105 is recorded.

Sum raw counts per donor, region and cell type. Exclude pseudobulks with fewer
than 20 nuclei. Fewer than three retained donors in either group means
`insufficient_donors`, no model and null scores. Nucleus counts describe retained
pseudobulks, excluding smaller groups.

Map symbols with the bulk pipeline's `map_symbols_to_entrez`: org.Hs.eg.db SYMBOL
first, then uniquely resolving ALIAS. On Entrez collisions keep the feature with
highest mean raw pseudobulk count across the GSE272082 samples. Carry symbol and
Ensembl alongside string Entrez IDs. Fit each cohort x region x type separately:
edgeR filterByExpr defaults, TMM, limma voom, `~group` with control first,
`groupAD`, robust eBayes and BH FDR. Positive means up in AD. Report GFAP, SST and
VGF statistics as descriptive sign checks, without using them to tune the model.

Use the frozen benchmark candidate pool ranks 1–20 in pool order. Read only gold
LINCS ranking contexts, with the existing frozen split and gold criteria.
Standardise wtcs, ks and cosine over all gold ranking signatures, then average
z scores for consensus. Context means and compound medians follow the bulk
method. Method fields contain raw method medians; consensus contains the median
of context consensus means. Use `build_query_sets` with top 150 up/down and its
recorded FDR fallback. Include the frozen pool's bulk consensus for comparison.
No held-out LINCS responses enter this computation.

Intermediate TSV files, fitted signatures, package versions and final panel all
receive provenance sidecars. The panel includes raw input SHA-256 checksums,
thresholds, inferred mapping, exclusions, query fallback flags, sign checks and
runtime. Outputs are exploratory expression comparisons requiring human sign-off.
