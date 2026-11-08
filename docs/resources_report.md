# Cross-resource agreement

Generated 2026-11-08T13:40:38+00:00. not preregistered; report-only.

GSE132903 alone supplies the AD-minus-control query. No held-out cohort, composition-adjusted signature, exposure lookup, truth table or benchmark output is read. These results never feed ranking, thresholds, tuning, candidate selection or the benchmark.

`build_query_sets` selected 150 up and 150 down landmark genes; FDR fallback: False. Symbols come from `lincs/genes.parquet` after alignment by string Entrez ID to `landmark_order.parquet`. Direction checks: GFAP stat=7.688864; SST stat=-7.264908; VGF stat=-8.781790.

The comparison set is the existing candidate pool sorted by `pool_rank`, first 100 rows. The full pool contains 1816 compounds. The local row reports pool rank and consensus median.

## Access and method

Perturb-Seqr was discovered through its homepage's [llms.txt](https://perturbseqr.maayanlab.cloud/llms.txt), [published query examples](https://raw.githubusercontent.com/MaayanLab/maayan-lab-tools-skills/main/skills/Perturb-Seqr/SKILL.md), and [current paired-search source](https://github.com/MaayanLab/PerturbSeqr/blob/main/mcp/src/tools/PairedGeneSetSearchTool.ts). POST JSON to `https://perturbseqr.maayanlab.cloud/graphql`, operation `PairEnrichmentQuery`, field `currentBackground.pairedEnrich`. Disease up is genesUp and disease down is genesDown; pvalueReverse tests opposite directions. No key is required. The paper URL supplied for this task returned a browser check, so API semantics were checked against the resource's own docs and source.

An initial default-filter query returned 79 signature pairs across chemical and gene libraries. The final query explicitly selects the nine chemical libraries below, `filterFda=false`, `filterKo=false`, `overlapGe=1`, `pvalueLe=1`, `adjPvalueLe=1`, `topN=10000`, `sortby=pvalue_reverse`, and pages of 10000 using offset until totalCount is reached. The full returned universe is ranked without a significance cutoff. `topN` is a server search parameter, not a guarantee of database-wide coverage. Pagination counts and response hashes are retained.

CREEDS Chem, DeepCover MoA, Ginkgo Bioworks, LINCS L1000 CP, Microarrays CMAP, NIBR DRUG-seq, RummaGEO Chem, SciPlex, Tahoe-100M.

Each normalized chemical gets its minimum raw reversal p-value across returned signatures. Lower score means stronger reversal enrichment; tied p-values share competition rank. Values within 1e-9 above 1 are clamped to 1; larger or nonfinite values abort the comparison. Raw values remain in the cache. `n_ranked` counts unique normalized compounds in this returned universe, not all compounds in the underlying database. This is an exploratory best-signature summary, not the website's consensus statistic; it favors compounds with more contexts and does not imply significance.

Matching casefolds names, replaces hyphens with spaces, removes recognized trailing salts, then removes spaces. Exact pert_iname matches take priority, followed by a direct pert_id when returned by CLUE, then drug_name as fallback. Duplicate pool IDs sharing the same normalized perturbation name can share a resource rank. No fuzzy matches. Fallback aliases shared by distinct normalized perturbation names are left unscored. not_found means no match in the returned universe, not absence from the resource or evidence against reversal.

[CLUE's documented API](https://clue.io/connectopedia/query_api_tutorial) submits paired GMT Entrez lists to `/api/jobs` with `user_key` from TS_CLUE_API_KEY, polls `/api/jobs/findByJobId/{id}`, and downloads the result archive. The optional collector reads `ps_pert_summary.gctx`, orders tau ascending and skips missing values. Without the key it makes no request and records needs_key. The authenticated path was not live-verified in this run.

## Coverage and correlation

Spearman compares local consensus median with each external score over matched top-100 compounds only. Both scores rank reversal lower, so positive rho indicates agreement. No missing-score imputation. Fewer than three overlaps or constant scores means rho is undefined. P-values are descriptive, unadjusted, and conditional on this selected top-100 set.

| Resource | Available / 100 | Ranked universe | Spearman rho | Descriptive p |
|---|---:|---:|---:|---:|
| tauchstone_lincs_gold | 100 | 1816 | 1.000000 | 0 |
| perturb_seqr | 95 | 10482 | -0.012809 | 0.901953 |
| clue | 55 | 6382 | 0.092973 | 0.499591 |

Local self-correlation is a reference only.

perturb_seqr statuses: `{"available": 95, "not_found": 5}`.

clue statuses: `{"available": 55, "not_found": 45}`.

## Limits and reproducibility

Perturb-Seqr includes LINCS L1000 chemical data, so agreement can reflect shared source data. The server may also include contexts that Tauchstone holds out. All external results are therefore quarantined in report-only outputs and provide no held-out validation claim. Resources differ in species, cells, assay, background, context counts and scoring. A low or missing correlation is not a verdict on a compound. A human must review any scientific interpretation.

Run `uv run python -m pipelines.resources.collect`; replay without network with `uv run python -m pipelines.resources.collect --offline`. Defaults use $TS_DATA_DIR or ~/Data/tauchstone. Raw responses and request metadata live in raw/resources/{resource}/, named with UTC timestamp and SHA-256; query.json records the exact symbols and Entrez IDs. Processed resources/agreement.parquet has a provenance sidecar including input hashes, raw response hashes, parameters, git commit and output checksum. No randomness is used.

Processing commit: `857d4b6cb5f66f15cd002af7ae77263142830b62-dirty`.

perturb_seqr: 16 cached artifacts; fetched_at 2026-11-07T21:35:57+00:00 to 2026-11-07T21:36:25+00:00.
clue: 23 cached artifacts; fetched_at 2026-11-08T13:26:44+00:00 to 2026-11-08T13:40:38+00:00.
