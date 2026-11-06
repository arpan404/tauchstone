# GSE132903 Tier 2: cell-composition sensitivity. Refit the primary limma model
# with per-sample brain cell-type scores (neuron, astrocyte, microglia,
# oligodendrocyte) added as numeric covariates.
#
# Markers: BRETIGEA::markers_df_human_brain (McKenzie et al. 2018, Sci Rep),
# top 50 per cell type (neu, ast, mic, oli) in package ranking order, mapped to
# Entrez via org.Hs.eg.db. Score = mean of row-z-scored log expression over the
# type's markers present in the same filtered/collapsed matrix as the main fit.
# Cross-check: BRETIGEA::findCells(method='SVD'); Pearson cor reported only.
#
# Run from the repo root: Rscript pipelines/geo/R/06_composition.R

source("pipelines/geo/R/common.R")
suppressMessages({
  library(limma); library(nanoparquet); library(jsonlite); library(matrixStats)
  library(BRETIGEA); library(org.Hs.eg.db); library(AnnotationDbi)
})

COHORT <- "GSE132903"
set.seed(20261105)

sig_dir <- SIG_DIR()
inputs <- read_checksums(c("geo/GSE132903/GSE132903_series_matrix.txt.gz",
                           "geo/GSE132903/GSE132903_Non-normalized_data.txt.gz",
                           "geo/GPL10558/GPL10558.annot.gz"))
bretigea_version <- as.character(utils::packageVersion("BRETIGEA"))
eg_version <- as.character(utils::packageVersion("org.Hs.eg.db"))

fit <- readRDS(file.path(sig_dir, "_interim", "gse132903_fit.rds"))
E <- fit$E               # filtered/collapsed log2 expression, included samples
group <- fit$group
cov_df <- fit$cov_df     # age, sex
entrez <- fit$entrez
symbols <- fit$symbol
sample_ids <- colnames(E)
cat(sprintf("[composition] matrix: %d genes x %d samples\n", nrow(E), ncol(E)))

# --- 1. markers ------------------------------------------------------------------
md <- BRETIGEA::markers_df_human_brain
cat(sprintf("[composition] markers df cols: %s (n=%d)\n",
            paste(colnames(md), collapse = ", "), nrow(md)))
stopifnot(all(c("markers", "cell") %in% colnames(md)))
CELL_TYPES <- c("neu", "ast", "mic", "oli")
stopifnot(all(CELL_TYPES %in% unique(md$cell)))
top_markers <- lapply(CELL_TYPES, function(ct) {
  g <- md$markers[md$cell == ct]
  head(unique(g), 50)  # package ranking order = row order within cell type
})
names(top_markers) <- CELL_TYPES
cat(sprintf("[composition] markers per type (top-50 requested): %s\n",
            paste(vapply(top_markers, length, integer(1)), collapse = ", ")))

map_one <- function(syms) {
  suppressWarnings(AnnotationDbi::mapIds(org.Hs.eg.db, keys = syms,
                                        column = "ENTREZID", keytype = "SYMBOL",
                                        multiVals = "first"))
}
marker_entrez <- lapply(top_markers, function(syms) {
  e <- map_one(syms)
  e <- e[!is.na(e)]
  e[e %in% entrez]  # present in the filtered/collapsed matrix
})
n_present <- vapply(marker_entrez, length, integer(1))
cat(sprintf("[composition] markers present in matrix: %s\n",
            paste(sprintf("%s=%d/50", CELL_TYPES, n_present), collapse = ", ")))
if (any(n_present < 20)) {
  stop(sprintf("[composition] fewer than 20 markers present for: %s. Stopping.",
               paste(CELL_TYPES[n_present < 20], collapse = ", ")))
}

# --- 2. per-sample scores: mean of row-z-scored expression --------------------------
z <- (E - rowMeans(E, na.rm = TRUE)) / matrixStats::rowSds(E, na.rm = TRUE)
z[!is.finite(z)] <- 0
scores_mean_z <- sapply(CELL_TYPES, function(ct) {
  idx <- match(marker_entrez[[ct]], entrez)
  colMeans(z[idx, , drop = FALSE], na.rm = TRUE)
})
colnames(scores_mean_z) <- CELL_TYPES

# --- 3. cross-check: BRETIGEA SVD -------------------------------------------------------
# findCells matches rownames(object) to markers$gene (symbols): build a
# unique-symbol version of E.
sym_uniq <- symbols
dup <- duplicated(sym_uniq)
if (any(dup)) {
  m_all <- rowMeans(E, na.rm = TRUE)
  ord <- order(sym_uniq, -m_all)
  E_sym <- E[ord[!duplicated(sym_uniq[ord])], , drop = FALSE]
  rownames(E_sym) <- sym_uniq[ord[!duplicated(sym_uniq[ord])]]
} else {
  E_sym <- E
  rownames(E_sym) <- sym_uniq
}
svd_mat <- BRETIGEA::findCells(inputMat = E_sym, markers = md, nMarker = 50, method = "SVD")
svd_scores <- as.data.frame(svd_mat)
cat(sprintf("[composition] findCells SVD: %d samples x types %s\n",
            nrow(svd_scores), paste(colnames(svd_scores), collapse = ", ")))
stopifnot(all(CELL_TYPES %in% colnames(svd_scores)))
svd_scores <- svd_scores[sample_ids, CELL_TYPES, drop = FALSE]
svc <- sapply(CELL_TYPES, function(ct)
  stats::cor(scores_mean_z[, ct], svd_scores[, ct], method = "pearson"))
cat(sprintf("[composition] Pearson(mean-z, SVD) per type: %s\n",
            paste(sprintf("%s=%.3f", CELL_TYPES, svc), collapse = ", ")))

# --- 4. refit with scores as covariates ------------------------------------------------------
score_df <- as.data.frame(scores_mean_z)
full_cov <- cbind(cov_df, score_df)
design <- design_for(group, full_cov)
cat(sprintf("[composition] design rank %d of %d cols\n", qr(design)$rank, ncol(design)))

# VIF for the score covariates; drop the most collinear if rank-deficient or VIF > 10
vif_of <- function(D, cols) {
  vapply(cols, function(cn) {
    others <- setdiff(colnames(D), c("(Intercept)", cn))
    f <- stats::lm(D[, cn] ~ ., data = as.data.frame(D[, others, drop = FALSE]))
    1 / (1 - summary(f)$r.squared)
  }, numeric(1))
}
score_cols <- CELL_TYPES
vifs <- vif_of(design, score_cols)
cat(sprintf("[composition] VIFs: %s\n",
            paste(sprintf("%s=%.2f", names(vifs), vifs), collapse = ", ")))
dropped_score <- NA_character_
if (qr(design)$rank < ncol(design) || any(vifs > 10)) {
  dropped_score <- names(which.max(vifs))
  cat(sprintf("[composition] dropping most collinear score: %s\n", dropped_score))
  score_cols <- setdiff(score_cols, dropped_score)
  design <- design_for(group, cbind(cov_df, score_df[, score_cols, drop = FALSE]))
  vifs <- vif_of(design, score_cols)
  cat(sprintf("[composition] post-drop rank %d/%d, VIFs: %s\n", qr(design)$rank, ncol(design),
              paste(sprintf("%s=%.2f", names(vifs), vifs), collapse = ", ")))
  stopifnot(qr(design)$rank == ncol(design))
}

ef <- limma::eBayes(limma::lmFit(E, design), robust = TRUE)
tt <- limma::topTable(ef, coef = "groupAD", number = Inf, sort.by = "none",
                      adjust.method = "BH")
adj <- finalize_main_table(entrez, symbols,
                           log2fc = tt$logFC, stat = tt$t,
                           p_value = tt$P.Value, fdr = tt$adj.P.Val,
                           mean_expr = tt$AveExpr, method = "limma")
check_main_contract(adj)

# --- 5. outputs ----------------------------------------------------------------------------
model_str <- paste("~", paste(c(colnames(cov_df), score_cols, "group"), collapse = " + "))
params <- list(
  marker_source = sprintf("BRETIGEA %s, markers_df_human_brain (McKenzie et al. 2018, Sci Rep)", bretigea_version),
  entrez_mapping = sprintf("org.Hs.eg.db %s SYMBOL multiVals='first'", eg_version),
  markers_requested_per_type = 50,
  markers_present = as.list(n_present),
  score_method = "mean of row-z-scored log expression over present markers (all included samples)",
  svd_crosscheck_pearson = as.list(svc),
  vif = as.list(vifs), dropped_score = if (is.na(dropped_score)) NULL else dropped_score,
  fdr_method = "BH", ebayes_robust = TRUE)
gene_map_version <- sprintf("as GSE132903__main; markers BRETIGEA %s", bretigea_version)

adj_path <- file.path(sig_dir, paste0(COHORT, "__composition_adjusted.parquet"))
write_output(adj, adj_path, step = "composition_adjusted_signature",
             dataset_accession = COHORT, inputs = inputs,
             sample_filter = "included samples of the main fit; no additional filtering",
             gene_mapping_version = gene_map_version, model = model_str,
             parameters = params, random_seed = NULL,
             validation_context = "composition_adjusted")

cell_scores <- rbind(
  data.frame(sample_id = sample_ids, group = group, scores_mean_z,
             method = "mean_z", stringsAsFactors = FALSE),
  data.frame(sample_id = sample_ids, group = group, svd_scores,
             method = "svd", stringsAsFactors = FALSE))
rownames(cell_scores) <- NULL
stopifnot(identical(colnames(cell_scores),
                    c("sample_id", "group", "neu", "ast", "mic", "oli", "method")))
cs_path <- file.path(sig_dir, paste0(COHORT, "__cell_scores.parquet"))
write_output(cell_scores, cs_path, step = "cell_composition_scores",
             dataset_accession = COHORT, inputs = inputs,
             sample_filter = "included samples of the main fit",
             gene_mapping_version = gene_map_version, model = "score per sample per cell type",
             parameters = params, random_seed = NULL,
             validation_context = "composition_adjusted")

# --- 6. composition.md --------------------------------------------------------------------------
main <- nanoparquet::read_parquet(file.path(sig_dir, paste0(COHORT, "__main.parquet")))
shared <- intersect(main$entrez_id, adj$entrez_id)
a <- main[match(shared, main$entrez_id), ]
b <- adj[match(shared, adj$entrez_id), ]
rho <- stats::cor.test(a$stat, b$stat, method = "spearman")
n_fdr_main <- sum(a$fdr < 0.05)
n_fdr_adj <- sum(b$fdr < 0.05)
sc <- sign_check_table(adj)
comp_lines <- c(
  "# Composition sensitivity: GSE132903 main vs composition-adjusted signature",
  "",
  sprintf("Markers: BRETIGEA %s top-50/type present in matrix: %s.",
          bretigea_version,
          paste(sprintf("%s %d/50", CELL_TYPES, n_present), collapse = ", ")),
  sprintf("Mean-z vs SVD Pearson per type (report only): %s.",
          paste(sprintf("%s %.3f", CELL_TYPES, svc), collapse = ", ")),
  sprintf("Refit design `%s`.%s", model_str,
          if (!is.na(dropped_score)) sprintf(" Dropped collinear score: %s.", dropped_score)
          else " No collinearity action needed."),
  sprintf("VIFs of score covariates: %s.",
          paste(sprintf("%s %.2f", names(vifs), vifs), collapse = ", ")),
  "",
  "## Per-cell-type scores by group (mean-z method, t-test)",
  "",
  "| cell type | mean AD | mean control | t-test p |",
  "|---|---|---|---|")
for (ct in CELL_TYPES) {
  x <- scores_mean_z[group == "AD", ct]
  y <- scores_mean_z[group == "control", ct]
  p <- stats::t.test(x, y)$p.value
  comp_lines <- c(comp_lines,
                  sprintf("| %s | %.4f | %.4f | %.3g |", ct, mean(x), mean(y), p))
}
comp_lines <- c(comp_lines, "",
  "Expectation: lower neuron and higher astrocyte/microglia scores in AD.",
  "",
  "## Main vs adjusted",
  sprintf("- Spearman rho of stat: %.4f (p=%.3g, n=%d shared genes)", rho$estimate, rho$p.value, length(shared)),
  sprintf("- FDR<0.05 genes: %d before -> %d after", n_fdr_main, n_fdr_adj),
  "",
  "## Sign check on the adjusted signature (report only; cell-type markers may weaken)",
  "",
  "| symbol | expected | stat | fdr | matches |",
  "|---|---|---|---|---|",
  sprintf("| %s | %s | %.3f | %.3g | %s |", sc$symbol, sc$expected, sc$stat, sc$fdr,
          ifelse(is.na(sc$matches), "missing", ifelse(sc$matches, "yes", "NO"))),
  "")
writeLines(comp_lines, file.path(sig_dir, "composition.md"))
cat(sprintf("[composition] done: rho=%.4f, FDR %d -> %d, sign %d/7\n",
            rho$estimate, n_fdr_main, n_fdr_adj, sum(sc$matches, na.rm = TRUE)))
