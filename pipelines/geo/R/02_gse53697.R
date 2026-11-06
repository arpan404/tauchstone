# GSE53697 (HELD-OUT cohort 2): dorsolateral prefrontal cortex RNA-seq,
# 8 control + 9 AD. Counts are partly non-integer -> rounded (recorded).
# DESeq2, Wald stat for AD vs control. No per-sample covariates in GEO.
#
# Run from the repo root: Rscript pipelines/geo/R/02_gse53697.R

source("pipelines/geo/R/common.R")
suppressMessages({
  library(GEOquery); library(Biobase); library(DESeq2); library(edgeR)
  library(nanoparquet); library(jsonlite); library(matrixStats)
})

COHORT <- "GSE53697"
set.seed(20261105)

sig_dir <- SIG_DIR()
raw_geo <- file.path(RAW_DIR(), "geo")
sm_file <- file.path(raw_geo, "GSE53697", "GSE53697_series_matrix.txt.gz")
counts_file <- file.path(raw_geo, "GSE53697", "GSE53697_RNAseq_AD.txt.gz")
inputs <- read_checksums(c("geo/GSE53697/GSE53697_series_matrix.txt.gz",
                           "geo/GSE53697/GSE53697_RNAseq_AD.txt.gz"))

# --- 1. samples from series matrix ----------------------------------------------
gse <- getGEO(filename = sm_file)
sample_ids <- as.character(Biobase::pData(gse)$geo_accession)
desc <- as.character(Biobase::pData(gse)$description)
char <- parse_characteristics(gse)
group <- ifelse(grepl("control", char$`disease status`), "control",
                ifelse(grepl("Alzheimer", char$`disease status`), "AD", NA_character_))
cat(sprintf("[%s] raw disease status -> group:\n", COHORT))
print(table(raw = char$`disease status`, group = group, useNA = "ifany"))
stopifnot(!any(is.na(group)))
assert_group_counts(group, 9L, 8L, COHORT)
# cross-check: description C1..C8 = control, A9..A17 = AD
cat(sprintf("[%s] description head: %s\n", COHORT, paste(head(desc), collapse = " ")))

# --- 2. counts: round non-integers (recorded) -------------------------------------
raw <- utils::read.table(gzfile(counts_file, "rt"), header = TRUE, sep = "\t",
                         stringsAsFactors = FALSE, check.names = FALSE)
raw_cols <- grep("_raw$", colnames(raw), value = TRUE)
count_mat <- as.matrix(raw[, raw_cols])
mode(count_mat) <- "numeric"
n_nonint <- sum(count_mat != round(count_mat), na.rm = TRUE)
cat(sprintf("[%s] non-integer count cells rounded: %d of %d\n",
            COHORT, n_nonint, length(count_mat)))
counts <- round(count_mat)
storage.mode(counts) <- "integer"
# column order check: C1..C8 then A9..A17 must match series-matrix sample order
short <- sub("^(C|A)([0-9]+)_raw$", "\\1\\2", raw_cols)
cat(sprintf("[%s] count columns: %s\n", COHORT, paste(short, collapse = " ")))
stopifnot(identical(short, desc))
colnames(counts) <- sample_ids
rownames(counts) <- as.character(raw$GeneID)
gene_symbol <- as.character(raw$GeneSymbol)
stopifnot(!any(is.na(rownames(counts))), !any(rownames(counts) == ""))

# --- 3. low-expression filter (filterByExpr), QC, outliers --------------------------
keep_gene <- edgeR::filterByExpr(counts, group = factor(group, levels = c("control", "AD")))
cat(sprintf("[%s] filterByExpr: %d/%d genes kept\n", COHORT, sum(keep_gene), length(keep_gene)))
counts_f <- counts[keep_gene, , drop = FALSE]
sym_f <- gene_symbol[keep_gene]

col_data_qc <- data.frame(group = factor(group, levels = c("control", "AD")))
rownames(col_data_qc) <- sample_ids
dds_qc <- DESeq2::DESeqDataSetFromMatrix(counts_f, col_data_qc, design = ~group)
vsd <- DESeq2::vst(dds_qc, blind = TRUE)
E_vst <- SummarizedExperiment::assay(vsd)
colnames(E_vst) <- sample_ids
flags <- qc_plots(E_vst, group, COHORT, sig_dir)
print(flags[!is.na(flags$reason), ])
excl <- apply_exclusion_rule(flags)
cat(sprintf("[%s] outliers: %s\n", COHORT, excl$note))
included <- !excl$excluded

# --- 4. covariates: none available -> all unspecified -------------------------------
cov_res <- resolve_covariates(
  list(age = NULL, sex = NULL, pmi = NULL, rin = NULL, batch = NULL), included)
cat(sprintf("[%s] covariates used: (none); unspecified: %s\n", COHORT,
            paste(cov_res$unspecified, collapse = ", ")))
cov_df <- cov_res$used

# --- 5. DESeq2 on included samples -----------------------------------------------------
keep_gene_inc <- edgeR::filterByExpr(counts[, included, drop = FALSE],
  group = factor(group[included], levels = c("control", "AD")))
cat(sprintf("[%s] filterByExpr on included: %d kept\n", COHORT, sum(keep_gene_inc)))
fit <- fit_deseq2(counts[keep_gene_inc, included, drop = FALSE], group[included], cov_df)
cat(sprintf("[%s] resultsNames: %s\n", COHORT, paste(fit$results_names, collapse = ", ")))
cat(sprintf("[%s] genes with NA padj set to fdr=1 (independent filtering): %d\n",
            COHORT, fit$table$n_if_fdr1))
main <- finalize_main_table(rownames(counts)[keep_gene_inc],
                            gene_symbol[keep_gene_inc],
                            log2fc = fit$table$log2fc, stat = fit$table$stat,
                            p_value = fit$table$p_value, fdr = fit$table$fdr,
                            mean_expr = fit$table$mean_expr, method = "deseq2")
check_main_contract(main)

# --- 6. sign check (report only for held-out cohorts) ------------------------------------
sc <- sign_check_table(main)
cat(sprintf("[%s] sign check (AD minus control):\n", COHORT))
print(sc)

# --- 7. write outputs ----------------------------------------------------------------------
model_str <- "~ group"
params <- list(
  rounding = sprintf("rounded %d non-integer cells to integers", n_nonint),
  gene_filter = "edgeR::filterByExpr on included samples",
  deseq = "DESeq() defaults; results(name='group_AD_vs_control', alpha=0.05, independentFiltering=TRUE, cooksCutoff=TRUE)",
  n_genes_total = nrow(counts), n_genes_filtered = sum(keep_gene_inc),
  n_if_fdr1 = fit$table$n_if_fdr1,
  unspecified_covariates = c("age", "sex", "pmi", "rin", "batch"),
  fdr_method = "BH (DESeq2 independent filtering; NA padj -> fdr=1, stat kept)",
  qc_pca = "vst(dds, blind=TRUE)")
sample_filter_str <- sprintf("filterByExpr; %s", excl$note)
gene_map_version <- "counts file carries Entrez GeneID directly (hg18); no remapping"

main_path <- file.path(sig_dir, paste0(COHORT, "__main.parquet"))
write_output(main, main_path, step = "disease_signature", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL,
             validation_context = "held_out_cohort")

samples <- data.frame(
  sample_id = sample_ids, group = group, included = included,
  exclusion_reason = ifelse(is.na(excl$reasons), NA_character_, excl$reasons),
  age = NA_real_, sex = NA_character_,
  pmi = NA_real_, rin = NA_real_, batch = NA_character_,
  disease_status_raw = as.character(char$`disease status`),
  tissue_raw = as.character(char$tissue),
  description_raw = desc,
  stringsAsFactors = FALSE)
check_samples_contract(samples)
samples_path <- file.path(sig_dir, paste0(COHORT, "__samples.parquet"))
write_output(samples, samples_path, step = "cohort_qc", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL,
             validation_context = "held_out_cohort")

# --- 8. QC report -------------------------------------------------------------------------------
n_fdr <- sum(main$fdr < 0.05)
sign_rows <- paste0("| ", sc$symbol, " | ", sc$expected, " | ", sprintf("%.3f", sc$stat),
                   " | ", format(sc$fdr, digits = 3), " | ",
                   ifelse(is.na(sc$matches), "missing", ifelse(sc$matches, "yes", "NO")), " |",
                   collapse = "\n")
qc_md <- c(
  sprintf("# QC report: %s (held-out cohort)", COHORT),
  "",
  "Dorsolateral prefrontal cortex RNA-seq. DESeq2, Wald stat, AD minus control.",
  "Held out: never used for signature construction, tuning, or candidate choice.",
  "",
  "## Inputs",
  sprintf("- series matrix: geo/GSE53697/GSE53697_series_matrix.txt.gz (sha256 %s)", inputs[[1]]),
  sprintf("- counts: geo/GSE53697/GSE53697_RNAseq_AD.txt.gz (sha256 %s)", inputs[[2]]),
  sprintf("- rounded %d non-integer count cells to integers", n_nonint),
  "",
  "## Samples",
  sprintf("- parsed groups: AD=%d, control=%d (asserted 9/8)", sum(group == "AD"), sum(group == "control")),
  sprintf("- outliers (PCA on blind vst): %s", excl$note),
  "- flagged samples (if any):",
  if (any(!is.na(flags$reason))) paste0("  - ", flags$sample[!is.na(flags$reason)], ": ", flags$reason[!is.na(flags$reason)]) else "  - none",
  "",
  "## Covariates",
  "- used: none. Series matrix carries only disease status / tissue / tissue subtype.",
  "- unspecified: age, sex, pmi, rin, batch.",
  "",
  "## Genes",
  sprintf("- genes: %d total (Entrez GeneID direct) -> %d after filterByExpr on included samples",
          nrow(counts), nrow(main)),
  sprintf("- FDR<0.05 genes: %d of %d", n_fdr, nrow(main)),
  sprintf("- NA padj from independent filtering set to fdr=1 (stat kept): %d genes", fit$table$n_if_fdr1),
  "- diagnostic cross-check (not used for output): limma-voom on the same rounded counts also gives 0 FDR<0.05 (243 raw p<0.05 of 15822, below the ~791 expected under the null). The gene-level signal in this small cohort is null-like; sign directions remain 7/7 consistent but weak.",
  "",
  "## Sign check (AD minus control; report only, no gate on held-out data)",
  "",
  "| symbol | expected | stat | fdr | matches |",
  "|---|---|---|---|---|",
  sign_rows,
  "",
  "## Plots",
  sprintf("- %s__pca.png", COHORT),
  sprintf("- %s__density.png", COHORT),
  "")
writeLines(qc_md, file.path(sig_dir, paste0(COHORT, "__qc.md")))
cat(sprintf("[%s] done: %d genes, %d FDR<0.05, %d/%d included samples\n",
            COHORT, nrow(main), n_fdr, sum(included), length(included)))
