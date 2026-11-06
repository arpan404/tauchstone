# GSE173955 (HELD-OUT cohort 1): hippocampus RNA-seq, 8 AD + 10 non-AD.
# GEO carries TPM only (no counts), gene symbols only. limma-trend on
# log2(TPM+1), AD minus control.
#
# Spreadsheet layout (Table 1): row1 title, row2 group labels, row3 sample
# numbers 1..8 + Mean/SD (AD, cols B..K) then 1..10 + Mean/SD (non-AD).
# Data rows start at row 4; trailing columns hold the paper's own stats and
# start/end positions (ignored here).
#
# Run from the repo root: Rscript pipelines/geo/R/03_gse173955.R

source("pipelines/geo/R/common.R")
suppressMessages({
  library(GEOquery); library(Biobase); library(limma)
  library(nanoparquet); library(jsonlite); library(matrixStats); library(readxl)
})

COHORT <- "GSE173955"
set.seed(20261105)

sig_dir <- SIG_DIR()
raw_geo <- file.path(RAW_DIR(), "geo")
sm_file <- file.path(raw_geo, "GSE173955", "GSE173955_series_matrix.txt.gz")
xlsx_file <- file.path(raw_geo, "GSE173955", "GSE173955_Table_1_gene_level_expression.xlsx")
inputs <- read_checksums(c("geo/GSE173955/GSE173955_series_matrix.txt.gz",
                           "geo/GSE173955/GSE173955_Table_1_gene_level_expression.xlsx"))

# --- 1. samples: series-matrix titles <-> spreadsheet columns --------------------
gse <- getGEO(filename = sm_file)
pd <- Biobase::pData(gse)
sample_ids <- as.character(pd$geo_accession)
titles <- as.character(pd$title)
char <- parse_characteristics(gse)
cat(sprintf("[%s] titles:\n", COHORT)); print(table(titles))
is_ad_gsm <- grepl("^Alzheimer's Disease_Biological", titles)
is_ctrl_gsm <- grepl("^non-Alzheimer", titles)
stopifnot(sum(is_ad_gsm) == 8, sum(is_ctrl_gsm) == 10)
stopifnot(all(is_ad_gsm[1:8]), all(is_ctrl_gsm[9:18]))  # AD reps 1-8 first
group <- ifelse(is_ad_gsm, "AD", "control")
cat(sprintf("[%s] raw title -> group:\n", COHORT))
print(table(raw = ifelse(is_ad_gsm, "AD_bio_replicate", "nonAD_bio_replicate"),
            group = group, useNA = "ifany"))
assert_group_counts(group, 8L, 10L, COHORT)

# --- 2. TPM matrix -----------------------------------------------------------------
sheet <- readxl::read_excel(xlsx_file, sheet = 1, col_names = FALSE)
stopifnot(ncol(sheet) >= 24)
sym_col <- as.character(unlist(sheet[4:nrow(sheet), 1]))
sym_col <- gsub("^'|'$", "", sym_col)
ad_tpm <- as.matrix(sheet[4:nrow(sheet), 2:9])
nad_tpm <- as.matrix(sheet[4:nrow(sheet), 13:22])
mode(ad_tpm) <- "numeric"; mode(nad_tpm) <- "numeric"
tpm <- cbind(ad_tpm, nad_tpm)
colnames(tpm) <- sample_ids  # AD cols 1-8 -> GSM5283449-56; non-AD -> GSM5283457-66
stopifnot(!any(is.na(tpm)))
cat(sprintf("[%s] TPM matrix: %d rows x %d cols; NA cells: %d\n",
            COHORT, nrow(tpm), ncol(tpm), sum(is.na(tpm))))

# de-duplicate symbol rows: identical duplicate rows first, then highest mean
dup_sym <- unique(sym_col[duplicated(sym_col)])
cat(sprintf("[%s] duplicated symbols: %d (e.g. %s)\n", COHORT, length(dup_sym),
            paste(head(dup_sym), collapse = ", ")))
row_key <- apply(tpm, 1, paste, collapse = ",")
ord <- order(sym_col, row_key)
tpm_o <- tpm[ord, , drop = FALSE]; sym_o <- sym_col[ord]
exact_dup <- duplicated(data.frame(sym = sym_o, key = row_key[ord]))
tpm_u <- tpm_o[!exact_dup, , drop = FALSE]; sym_u <- sym_o[!exact_dup]
cat(sprintf("[%s] exact-duplicate rows dropped: %d\n", COHORT, sum(exact_dup)))
m <- rowMeans(tpm_u, na.rm = TRUE)
ord2 <- order(sym_u, -m)
keep <- !duplicated(sym_u[ord2])
tpm_sym <- tpm_u[ord2[keep], , drop = FALSE]
symbols <- sym_u[ord2[keep]]
cat(sprintf("[%s] symbols after dedupe: %d\n", COHORT, length(symbols)))

# --- 3. symbol -> Entrez (SYMBOL first, unique ALIAS fallback) -------------------
map <- map_symbols_to_entrez(symbols)
n_unmapped <- sum(is.na(map$entrez))
cat(sprintf("[%s] symbol mapping: %d mapped, %d unmapped\n",
            COHORT, sum(!is.na(map$entrez)), n_unmapped))
mi <- match(symbols, map$symbol)
entrez <- map$entrez[mi]
keep_mapped <- !is.na(entrez)
cat(sprintf("[%s] dropped unmapped genes: %d\n", COHORT, sum(!keep_mapped)))
# two symbols -> same Entrez: keep the higher-mean one
tpm_m <- tpm_sym[keep_mapped, , drop = FALSE]
entrez_m <- entrez[keep_mapped]; sym_m <- symbols[keep_mapped]
mm <- rowMeans(tpm_m, na.rm = TRUE)
ord3 <- order(entrez_m, -mm)
keep2 <- !duplicated(entrez_m[ord3])
n_collapsed <- sum(!keep2)
tpm_g <- tpm_m[ord3[keep2], , drop = FALSE]
entrez_g <- entrez_m[ord3[keep2]]; sym_g <- sym_m[ord3[keep2]]
cat(sprintf("[%s] symbol collisions on one Entrez resolved (kept higher mean): %d\n",
            COHORT, n_collapsed))
gene_map_version <- sprintf("org.Hs.eg.db %s: SYMBOL multiVals='first', then ALIAS accepted only if unique",
                            as.character(utils::packageVersion("org.Hs.eg.db")))

# --- 4. filter (TPM >= 1 in at least 8 samples = smallest group size) -----------
E <- log2(tpm_g + 1)
keep_expr <- rowSums(tpm_g >= 1) >= 8
cat(sprintf("[%s] expression filter: %d/%d genes kept (TPM>=1 in >=8 samples)\n",
            COHORT, sum(keep_expr), length(keep_expr)))
E_f <- E[keep_expr, , drop = FALSE]
entrez_f <- entrez_g[keep_expr]; sym_f <- sym_g[keep_expr]

# --- 5. QC + outliers ---------------------------------------------------------------
flags <- qc_plots(E_f, group, COHORT, sig_dir)
print(flags[!is.na(flags$reason), ])
excl <- apply_exclusion_rule(flags)
cat(sprintf("[%s] outliers: %s\n", COHORT, excl$note))
included <- !excl$excluded

# --- 6. covariates ----------------------------------------------------------------------
age_num <- suppressWarnings(as.numeric(char$age))
sex_raw <- tolower(as.character(char$gender))
cov_res <- resolve_covariates(
  list(age = age_num, sex = sex_raw, pmi = NULL, rin = NULL, batch = NULL), included)
cat(sprintf("[%s] covariates used: %s; unspecified: %s\n", COHORT,
            if (ncol(cov_res$used)) paste(colnames(cov_res$used), collapse = ", ") else "(none)",
            paste(cov_res$unspecified, collapse = ", ")))
cov_df <- cov_res$used
if (ncol(cov_df) > 0) cov_df <- cov_df[included, , drop = FALSE]

# --- 7. limma-trend fit ---------------------------------------------------------------------
E_inc <- E_f[, included, drop = FALSE]
group_inc <- group[included]
fit <- fit_limma(E_inc, group_inc, cov_df, trend = TRUE)
tt <- fit$table
main <- finalize_main_table(entrez_f, sym_f,
                            log2fc = tt$logFC, stat = tt$t,
                            p_value = tt$P.Value, fdr = tt$adj.P.Val,
                            mean_expr = tt$AveExpr, method = "limma-trend")
check_main_contract(main)

# --- 8. sign check (report only for held-out cohorts) ---------------------------------------
sc <- sign_check_table(main)
cat(sprintf("[%s] sign check (AD minus control):\n", COHORT))
print(sc)

# --- 9. write outputs ----------------------------------------------------------------------------
model_str <- paste("~", paste(c(colnames(cov_df), "group"), collapse = " + "))
params <- list(
  input_note = "GEO carries TPM only (no counts); DESeq2 not applicable",
  dedupe = "exact-duplicate symbol rows dropped, then highest-mean row per symbol",
  symbol_mapping = "SYMBOL multiVals='first'; ALIAS fallback only if alias maps to exactly one Entrez; two symbols -> one Entrez keeps higher mean",
  n_tpm_rows = nrow(tpm), n_symbols_dedup = length(symbols),
  n_unmapped_symbols = n_unmapped, n_symbol_collisions = n_collapsed,
  gene_filter = "TPM >= 1 in at least 8 samples (smallest group size)",
  n_genes = nrow(main),
  unspecified_covariates = c("pmi", "rin", "batch"),
  fdr_method = "BH", ebayes_trend = TRUE, ebayes_robust = TRUE)
sample_filter_str <- sprintf("TPM>=1 in >=8 samples; %s", excl$note)

main_path <- file.path(sig_dir, paste0(COHORT, "__main.parquet"))
write_output(main, main_path, step = "disease_signature", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL,
             validation_context = "held_out_cohort")

samples <- data.frame(
  sample_id = sample_ids, group = group, included = included,
  exclusion_reason = ifelse(is.na(excl$reasons), NA_character_, excl$reasons),
  age = age_num, sex = sex_raw,
  pmi = NA_real_, rin = NA_real_, batch = NA_character_,
  gender_raw = as.character(char$gender),
  age_raw = as.character(char$age),
  stringsAsFactors = FALSE)
check_samples_contract(samples)
samples_path <- file.path(sig_dir, paste0(COHORT, "__samples.parquet"))
write_output(samples, samples_path, step = "cohort_qc", dataset_accession = COHORT,
             inputs = inputs, sample_filter = sample_filter_str,
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL,
             validation_context = "held_out_cohort")

# --- 10. QC report ----------------------------------------------------------------------------------
n_fdr <- sum(main$fdr < 0.05)
sign_rows <- paste0("| ", sc$symbol, " | ", sc$expected, " | ", sprintf("%.3f", sc$stat),
                   " | ", format(sc$fdr, digits = 3), " | ",
                   ifelse(is.na(sc$matches), "missing", ifelse(sc$matches, "yes", "NO")), " |",
                   collapse = "\n")
qc_md <- c(
  sprintf("# QC report: %s (held-out cohort)", COHORT),
  "",
  "Hippocampus RNA-seq (TPM only). limma-trend on log2(TPM+1), AD minus control.",
  "Held out: never used for signature construction, tuning, or candidate choice.",
  "",
  "## Inputs",
  sprintf("- series matrix: geo/GSE173955/GSE173955_series_matrix.txt.gz (sha256 %s)", inputs[[1]]),
  sprintf("- TPM table: geo/GSE173955/GSE173955_Table_1_gene_level_expression.xlsx (sha256 %s)", inputs[[2]]),
  "- spreadsheet layout: row1 title, row2 group labels, row3 sample numbers + Mean/SD (dropped);",
  "  AD TPM cols B..I (samples 1-8) -> GSM5283449-5283456, non-AD cols M..V (samples 1-10) -> GSM5283457-5283466.",
  "- trailing columns (paper's own stats, start/end positions) ignored; Mean/SD columns dropped.",
  "- design note: one AD and one non-AD sample were sequenced twice for depth; the table carries one column per biological replicate (8+10), matching the 18 GSM accessions.",
  "",
  "## Samples",
  sprintf("- parsed groups: AD=%d, control=%d (asserted 8/10)", sum(group == "AD"), sum(group == "control")),
  sprintf("- outliers: %s", excl$note),
  "- flagged samples (if any):",
  if (any(!is.na(flags$reason))) paste0("  - ", flags$sample[!is.na(flags$reason)], ": ", flags$reason[!is.na(flags$reason)]) else "  - none",
  "",
  "## Covariates",
  sprintf("- used in design `%s`: %s", model_str,
          if (ncol(cov_df)) paste(colnames(cov_df), collapse = ", ") else "(none)"),
  "- age: series-matrix 'age' (numeric). sex: 'gender' lowercased.",
  "- unspecified: pmi, rin, batch.",
  "",
  "## Genes",
  sprintf("- TPM rows: %d -> %d unique symbols (exact dups dropped) -> %d Entrez-mapped genes (%d unmapped symbols dropped, %d symbol collisions resolved to higher-mean symbol)",
          nrow(tpm), length(symbols), length(entrez_g),
          n_unmapped, n_collapsed),
  sprintf("- after TPM>=1-in->=8 filter: %d genes", nrow(main)),
  sprintf("- FDR<0.05 genes: %d of %d", n_fdr, nrow(main)),
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
