# GSE132903 (PRIMARY): middle temporal gyrus, Illumina HumanHT-12 v4, 97 AD + 98 control.
# limma with empirical Bayes. Contrast is AD minus control (coef 'groupAD').
#
# Input decision (spec): use limma::read.ilmn/neqc only if the non-normalized
# file carries per-sample 'Detection Pval' columns; otherwise use the
# series-matrix values (already VST + quantile normalized per the GEO
# data_processing record) with normalizeBetweenArrays(method='quantile').
#
# Run from the repo root: Rscript pipelines/geo/R/01_gse132903.R

source("pipelines/geo/R/common.R")
suppressMessages({
  library(GEOquery); library(Biobase); library(limma)
  library(nanoparquet); library(jsonlite); library(matrixStats)
})

COHORT <- "GSE132903"
set.seed(20261105)

sig_dir <- SIG_DIR()
raw_geo <- file.path(RAW_DIR(), "geo")
sm_file <- file.path(raw_geo, "GSE132903", "GSE132903_series_matrix.txt.gz")
nonnorm_file <- file.path(raw_geo, "GSE132903", "GSE132903_Non-normalized_data.txt.gz")
annot_file <- file.path(raw_geo, "GPL10558", "GPL10558.annot.gz")
inputs <- read_checksums(c("geo/GSE132903/GSE132903_series_matrix.txt.gz",
                           "geo/GSE132903/GSE132903_Non-normalized_data.txt.gz",
                           "geo/GPL10558/GPL10558.annot.gz"))

# --- 1. input branch: detection p-values present? ------------------------------
nn_con <- gzfile(nonnorm_file, "rt")
nn_lines <- readLines(nn_con, n = 12)
close(nn_con)
nn_header <- strsplit(nn_lines[grepl("^ID_REF", nn_lines)][1], "\t", fixed = TRUE)[[1]]
has_detp <- any(grepl("detection|pval|p-val|p_value", nn_header, ignore.case = TRUE))
cat(sprintf("[%s] non-normalized columns: %d; detection-pvalue columns present: %s\n",
            COHORT, length(nn_header), has_detp))
normalization <- NA_character_
if (has_detp) stop("spec branch: implement read.ilmn/neqc (unexpectedly reached)")
gse <- getGEO(filename = sm_file)
E_raw <- exprs(gse)
cat(sprintf("[%s] series-matrix range: [%.3f, %.3f] (log2-like VST scale expected)\n",
            COHORT, min(E_raw), max(E_raw)))
log2_applied <- FALSE
if (max(E_raw) > 50) {
  E_raw <- log2(E_raw + 1)
  log2_applied <- TRUE
}
E <- normalizeBetweenArrays(E_raw, method = "quantile")
normalization <- "series-matrix values (GEO lumi VST + quantile per data_processing) + normalizeBetweenArrays(quantile); no neqc: non-normalized file has intensity columns only, no detection p-values"
cat(sprintf("[%s] log2 transform applied: %s\n", COHORT, log2_applied))

# --- 2. samples: raw labels -> group -------------------------------------------
char <- parse_characteristics(gse)
sample_ids <- as.character(Biobase::pData(gse)$geo_accession)
colnames(E) <- sample_ids
stopifnot(identical(colnames(E), sample_ids))
group <- ifelse(char$diagnosis == "AD", "AD",
                ifelse(char$diagnosis == "ND", "control", NA_character_))
cat(sprintf("[%s] raw diagnosis -> group:\n", COHORT))
print(table(raw = char$diagnosis, group = group, useNA = "ifany"))
stopifnot(!any(is.na(group)))
assert_group_counts(group, 97L, 98L, COHORT)

# --- 3. probe filter (no detection p-values: mean above 25th percentile) -------
probe_means <- rowMeans(E, na.rm = TRUE)
thr <- stats::quantile(probe_means, 0.25)
keep_probe <- probe_means > thr
cat(sprintf("[%s] probe filter: %d/%d kept (mean > 25th pct = %.3f)\n",
            COHORT, sum(keep_probe), length(keep_probe), thr))
E_filt <- E[keep_probe, , drop = FALSE]

# --- 4. QC + outliers ------------------------------------------------------------
flags <- qc_plots(E_filt, group, COHORT, sig_dir)
print(flags[!is.na(flags$reason), ])
excl <- apply_exclusion_rule(flags)
cat(sprintf("[%s] outliers: %s\n", COHORT, excl$note))
included <- !excl$excluded

# --- 5. covariates (never impute) -------------------------------------------------
age_num <- parse_age_years(char$`expired_age (years)`)
cov_res <- resolve_covariates(
  list(age = age_num, sex = as.character(char$Sex),
       pmi = NULL, rin = NULL, batch = NULL),
  included)
cat(sprintf("[%s] covariates used: %s; unspecified: %s\n", COHORT,
            if (ncol(cov_res$used)) paste(colnames(cov_res$used), collapse = ", ") else "(none)",
            paste(cov_res$unspecified, collapse = ", ")))
cat(sprintf("[%s] age '90+' values coded as 90: n=%d\n", COHORT,
            sum(char$`expired_age (years)` == "90+", na.rm = TRUE)))
cov_df <- cov_res$used
if (ncol(cov_df) > 0) cov_df <- cov_df[included, , drop = FALSE]

# --- 6. probe -> Entrez, collapse ---------------------------------------------------
map <- map_probes_gpl10558(rownames(E_filt), annot_file)
cat(sprintf("[%s] probe mapping: %d kept with exactly one Entrez (of %d filtered probes)\n",
            COHORT, nrow(map), nrow(E_filt)))
m <- match(map$probe, rownames(E_filt))
col <- collapse_by_max_mean(E_filt[m, , drop = FALSE], map$entrez, map$symbol)
cat(sprintf("[%s] collapsed to %d genes\n", COHORT, nrow(col$E)))
gene_map_version <- "GPL10558.annot.gz (Annotation_date Aug 09 2016), Gene ID column"

# --- 7. limma fit on included samples ----------------------------------------------
E_inc <- col$E[, included, drop = FALSE]
group_inc <- group[included]
fit <- fit_limma(E_inc, group_inc, cov_df)
tt <- fit$table
main <- finalize_main_table(col$entrez, col$symbol,
                            log2fc = tt$logFC, stat = tt$t,
                            p_value = tt$P.Value, fdr = tt$adj.P.Val,
                            mean_expr = tt$AveExpr, method = "limma")
check_main_contract(main)

# --- 8. sign check (gate: >= 5/7 before anything is written) --------------------------
sc <- sign_check_table(main)
cat(sprintf("[%s] sign check (AD minus control):\n", COHORT))
print(sc)
n_match <- sum(sc$matches, na.rm = TRUE)
cat(sprintf("[%s] sign check: %d/7 match (need >= 5)\n", COHORT, n_match))
if (n_match < 5) stop(sprintf("[%s] SIGN CHECK FAILED (%d/7). Investigate label parsing; no outputs written.", COHORT, n_match))

# --- 9. write outputs ---------------------------------------------------------------
model_str <- paste("~", paste(c(colnames(cov_df), "group"), collapse = " + "))
params <- list(
  normalization = normalization, log2_transform_applied = log2_applied,
  probe_filter = "rowMeans above 25th percentile of probe means (no detection p-values in non-normalized file)",
  n_probes_total = nrow(E_raw), n_probes_filtered = nrow(E_filt),
  n_probes_mapped = nrow(map), n_genes = nrow(main),
  age_coding = "'90+' coded as 90 (right-censored top bin)",
  unspecified_covariates = c("pmi", "rin", "batch"),
  fdr_method = "BH", ebayes_robust = TRUE,
  sign_check_matches = paste0(n_match, "/7"))
sample_filter_str <- sprintf("probe mean>25pct; %s", excl$note)

main_path <- file.path(sig_dir, paste0(COHORT, "__main.parquet"))
write_output(main, main_path, step = "disease_signature", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL)

samples <- data.frame(
  sample_id = sample_ids, group = group, included = included,
  exclusion_reason = ifelse(is.na(excl$reasons), NA_character_, excl$reasons),
  age = age_num, sex = as.character(char$Sex),
  pmi = NA_real_, rin = NA_real_, batch = NA_character_,
  diagnosis_raw = as.character(char$diagnosis),
  tissue_raw = as.character(char$tissue),
  age_raw = as.character(char$`expired_age (years)`),
  stringsAsFactors = FALSE)
check_samples_contract(samples)
samples_path <- file.path(sig_dir, paste0(COHORT, "__samples.parquet"))
write_output(samples, samples_path, step = "cohort_qc", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL)

# interim for permutations (same filtered/collapsed matrix, included samples)
interim <- list(E = E_inc, entrez = col$entrez, symbol = col$symbol,
                group = group_inc, cov_df = cov_df)
interim_path <- file.path(sig_dir, "_interim", "gse132903_fit.rds")
dir.create(dirname(interim_path), showWarnings = FALSE, recursive = TRUE)
saveRDS(interim, interim_path)
jsonlite::write_json(list(step = "interim_fit_object", dataset_accession = COHORT,
                          inputs = inputs, model = model_str, parameters = params,
                          processing_version = PROCESSING_VERSION,
                          git_commit = git_commit(),
                          timestamp = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
                          output = basename(interim_path),
                          output_sha256 = sha256_file(interim_path)),
                     paste0(interim_path, ".provenance.json"),
                     auto_unbox = TRUE, pretty = TRUE, na = "null")

# --- 10. QC report ----------------------------------------------------------------------
n_fdr <- sum(main$fdr < 0.05)
qc_md <- c(
  sprintf("# QC report: %s (primary signature)", COHORT),
  "",
  "Middle temporal gyrus, Illumina HumanHT-12 v4 (GPL10558). limma + empirical Bayes,",
  "contrast AD minus control (coef groupAD).",
  "",
  "## Inputs",
  sprintf("- series matrix: %s (sha256 %s)", "geo/GSE132903/GSE132903_series_matrix.txt.gz", inputs[[1]]),
  sprintf("- non-normalized: %s (sha256 %s) -- intensity columns only, NO detection p-value columns, so neqc is not applicable", "geo/GSE132903/GSE132903_Non-normalized_data.txt.gz", inputs[[2]]),
  sprintf("- annotation: %s (sha256 %s)", "geo/GPL10558/GPL10558.annot.gz", inputs[[3]]),
  sprintf("- normalization: %s", normalization),
  sprintf("- series-matrix value range before normalizeBetweenArrays: [%.3f, %.3f]; log2(x+1) applied: %s",
          min(E_raw), max(E_raw), log2_applied),
  "",
  "## Samples",
  sprintf("- parsed groups: AD=%d, control=%d (raw diagnosis AD->AD, ND->control; asserted 97/98)", sum(group == "AD"), sum(group == "control")),
  sprintf("- outliers: %s", excl$note),
  "- flagged samples (if any):",
  if (any(!is.na(flags$reason))) paste0("  - ", flags$sample[!is.na(flags$reason)], ": ", flags$reason[!is.na(flags$reason)]) else "  - none",
  "",
  "## Covariates",
  sprintf("- used in design `%s`: %s", model_str,
          if (ncol(cov_df)) paste(colnames(cov_df), collapse = ", ") else "(none)"),
  "- age: parsed from 'expired_age (years)'; '90+' coded as 90 (right-censored top bin).",
  "- unspecified (absent from series matrix for at least one sample): pmi, rin, batch.",
  "- hyb_protocol notes samples randomized across batch runs with no batch effects for age/sex/RIN/PMI, but no per-sample batch variable is provided, so batch is unspecified.",
  "",
  "## Genes",
  sprintf("- probes: %d total -> %d after mean>25pct filter -> %d with exactly one Entrez -> %d genes after max-mean collapse",
          nrow(E_raw), nrow(E_filt), nrow(map), nrow(main)),
  sprintf("- FDR<0.05 genes: %d of %d", n_fdr, nrow(main)),
  "",
  "## Sign check (AD minus control; up genes must have stat > 0)",
  "",
  "| symbol | expected | stat | fdr | matches |",
  "|---|---|---|---|---|",
  paste0("| ", sc$symbol, " | ", sc$expected, " | ", sprintf("%.3f", sc$stat),
         " | ", format(sc$fdr, digits = 3), " | ", ifelse(is.na(sc$matches), "missing", ifelse(sc$matches, "yes", "NO")), " |",
         collapse = "\n"),
  "",
  "## Plots",
  sprintf("- %s__pca.png", COHORT),
  sprintf("- %s__density.png", COHORT),
  "")
writeLines(qc_md, file.path(sig_dir, paste0(COHORT, "__qc.md")))
cat(sprintf("[%s] done: %d genes, %d FDR<0.05, %d/%d included samples\n",
            COHORT, nrow(main), n_fdr, sum(included), length(included)))
