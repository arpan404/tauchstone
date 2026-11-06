# Tauchstone WS2: shared helpers for GEO disease-signature scripts.
#
# Implements the WS2 algorithm spec (Nov 2026): per-cohort signatures only,
# AD-minus-control sign (group factor levels c('control','AD'), coef 'groupAD'),
# Entrez Gene ID as a string join key, provenance on every output, missing
# covariates recorded as 'unspecified' never imputed.
#
# This file defines functions only and loads no packages at source time
# (callers/library calls live in the scripts, so unit tests stay light).

TS_DATA_DIR <- function() Sys.getenv("TS_DATA_DIR", unset = file.path(path.expand("~"), "Data", "tauchstone"))
RAW_DIR <- function() file.path(TS_DATA_DIR(), "raw")
SIG_DIR <- function() file.path(TS_DATA_DIR(), "processed", "signatures")
CHECKSUMS_FILE <- function() file.path("data", "manifests", "checksums.json")

PROCESSING_VERSION <- "0.1.0"
PERM_SEED <- 20261105L

# --- provenance ---------------------------------------------------------------

read_checksums <- function(keys) {
  # keys: manifest keys like 'geo/GSE53697/GSE53697_RNAseq_AD.txt.gz'.
  # Returns a named list key -> sha256. Stops if a key is absent.
  chk <- jsonlite::fromJSON(CHECKSUMS_FILE())
  out <- stats::setNames(vector("list", length(keys)), keys)
  for (k in keys) {
    if (!k %in% names(chk)) stop(sprintf("checksum key missing from manifests: %s", k))
    out[[k]] <- chk[[k]]$sha256
  }
  out
}

git_commit <- function() {
  sha <- tryCatch(
    system2("git", c("rev-parse", "HEAD"), stdout = TRUE, stderr = FALSE),
    error = function(e) NA_character_
  )
  if (length(sha) == 0 || any(is.na(sha))) return("unknown")
  dirty <- tryCatch(
    suppressWarnings(system2("git", c("diff", "--quiet"), stdout = FALSE, stderr = FALSE)),
    error = function(e) 0L
  )
  paste0(sha[[1]], if (!is.null(attr(dirty, "status")) && attr(dirty, "status") != 0) "-dirty" else "")
}

sha256_file <- function(path) {
  for (cmd in c("shasum", "sha256sum")) {
    if (nzchar(Sys.which(cmd))) {
      args <- if (cmd == "shasum") c("-a", "256", path) else c(path)
      out <- tryCatch(system2(cmd, args, stdout = TRUE, stderr = FALSE), error = function(e) "")
      if (length(out) > 0) return(strsplit(out[[1]], " ")[[1]][[1]])
    }
  }
  stop("no sha256 tool found (need shasum or sha256sum)")
}

write_output <- function(df, path, step, dataset_accession, inputs,
                         sample_filter = "none",
                         gene_mapping_version = "unspecified",
                         model = "", parameters = list(), random_seed = NULL,
                         validation_context = NULL) {
  # Write a parquet table plus its <file>.provenance.json sidecar, mirroring
  # pipelines/common/provenance.py fields.
  dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
  nanoparquet::write_parquet(df, path)
  record <- list(
    step = step,
    dataset_accession = dataset_accession,
    inputs = inputs,
    sample_filter = sample_filter,
    gene_mapping_version = gene_mapping_version,
    model = model,
    parameters = parameters,
    random_seed = random_seed,
    validation_context = validation_context,
    processing_version = PROCESSING_VERSION,
    git_commit = git_commit(),
    timestamp = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    output = basename(path),
    output_sha256 = sha256_file(path)
  )
  prov_path <- paste0(path, ".provenance.json")
  jsonlite::write_json(record, prov_path, auto_unbox = TRUE, pretty = TRUE, na = "null")
  invisible(prov_path)
}

# --- cohort readers -----------------------------------------------------------

parse_characteristics <- function(gse) {
  # One row per sample (expression-table column order), one column per raw
  # characteristic key. Values look like "key: value" in characteristics_ch1*.
  pd <- Biobase::pData(gse)
  char_cols <- grep("^characteristics_ch1", colnames(pd), value = TRUE)
  n <- nrow(pd)
  keys <- character(0)
  split_vals <- lapply(char_cols, function(cc) strsplit(as.character(pd[[cc]]), ": ", fixed = TRUE))
  for (sv in split_vals) for (kv in sv) {
    if (length(kv) >= 2 && !(kv[1] %in% keys)) keys <- c(keys, kv[1])
  }
  out <- data.frame(matrix(NA_character_, nrow = n, ncol = length(keys)))
  colnames(out) <- keys
  for (sv in split_vals) {
    for (i in seq_len(n)) {
      kv <- sv[[i]]
      if (length(kv) >= 2) out[i, kv[1]] <- paste(kv[-1], collapse = ": ")
    }
  }
  out
}

parse_age_years <- function(x) {
  # "90+" -> 90 (right-censored top bin, documented in provenance). Plain
  # integers pass through. Anything else becomes NA (never imputed).
  vapply(x, function(v) {
    if (is.na(v)) return(NA_real_)
    v <- trimws(v)
    if (grepl("^[0-9]+\\+$", v)) return(as.numeric(sub("\\+$", "", v)))
    if (grepl("^[0-9]+$", v)) return(as.numeric(v))
    NA_real_
  }, numeric(1), USE.NAMES = FALSE)
}

assert_group_counts <- function(group, n_ad, n_control, cohort) {
  tab <- table(factor(group, levels = c("AD", "control")))
  cat(sprintf("[%s] group counts: AD=%d control=%d\n", cohort, tab[["AD"]], tab[["control"]]))
  if (unname(tab[["AD"]]) != n_ad || unname(tab[["control"]]) != n_control) {
    stop(sprintf("[%s] expected %d AD / %d control, got %d / %d. Check label parsing!",
                 cohort, n_ad, n_control, tab[["AD"]], tab[["control"]]))
  }
  invisible(tab)
}

# --- covariates (never impute) -------------------------------------------------

resolve_covariates <- function(cov_list, included) {
  # cov_list: named list of per-sample vectors (numeric or character/factor).
  # A covariate is USED only if it is present (non-NULL, not all-NA) and has
  # no NA among included samples; factor covariates need >= 2 levels among
  # included samples. Everything else lands in `unspecified`.
  # Returns list(used = data.frame (possibly 0 cols), unspecified = character).
  used <- list()
  unspecified <- character(0)
  for (nm in names(cov_list)) {
    v <- cov_list[[nm]]
    if (is.null(v) || all(is.na(v))) { unspecified <- c(unspecified, nm); next }
    if (any(is.na(v[included]))) { unspecified <- c(unspecified, nm); next }
    if (is.numeric(v)) {
      used[[nm]] <- v
    } else {
      f <- factor(v[included])
      if (nlevels(f) < 2) { unspecified <- c(unspecified, nm); next }
      used[[nm]] <- factor(v, levels = levels(f))
    }
  }
  list(used = as.data.frame(used, stringsAsFactors = FALSE),
       unspecified = unspecified)
}

design_for <- function(group, cov_df) {
  # Final design: model.matrix(~ <covariates> + group), group last so the
  # AD-vs-control coefficient is picked up by name.
  group <- factor(group, levels = c("control", "AD"))
  if (ncol(cov_df) == 0) {
    stats::model.matrix(~group)
  } else {
    stats::model.matrix(~ ., data = cbind(cov_df, group = group))
  }
}

# --- outlier detection (>5% rule) ----------------------------------------------

detect_outliers <- function(E, sample_ids) {
  # E: genes x samples, log-scale. PCA on the top-2000 most variable genes
  # (prcomp, center=TRUE, scale.=FALSE). Flags a sample when its |PC1 or PC2
  # score - median| > 4 * MAD, or its median Pearson correlation to all other
  # samples is < median - 4 * MAD of those medians.
  # Returns data.frame(sample, pc1_mad, pc2_mad, cor_mad, reason).
  stopifnot(ncol(E) == length(sample_ids))
  vars <- matrixStats::rowVars(E, na.rm = TRUE)
  vars[!is.finite(vars)] <- 0
  k <- min(2000L, sum(vars > 0))
  top <- order(vars, decreasing = TRUE)[seq_len(k)]
  pc <- stats::prcomp(t(E[top, , drop = FALSE]), center = TRUE, scale. = FALSE)
  s1 <- pc$x[, 1]; s2 <- if (ncol(pc$x) >= 2) pc$x[, 2] else rep(0, nrow(pc$x))
  mad1 <- stats::mad(s1); mad2 <- stats::mad(s2)
  d1 <- if (mad1 > 0) abs(s1 - stats::median(s1)) / mad1 else rep(0, length(s1))
  d2 <- if (mad2 > 0) abs(s2 - stats::median(s2)) / mad2 else rep(0, length(s2))
  cm <- stats::cor(E, method = "pearson")
  diag(cm) <- NA
  med_cor <- apply(cm, 2, stats::median, na.rm = TRUE)
  mc <- stats::mad(med_cor)
  dc <- if (is.finite(mc) && mc > 0) (stats::median(med_cor) - med_cor) / mc else rep(0, length(med_cor))
  reason <- rep(NA_character_, length(sample_ids))
  hit1 <- d1 > 4
  hit2 <- d2 > 4
  hitc <- dc > 4
  reason[hit1] <- sprintf("PC1 %.1f MAD from median", d1[hit1])
  prev <- !is.na(reason)
  reason[hit2 & !prev] <- sprintf("PC2 %.1f MAD from median", d2[hit2 & !prev])
  reason[hit2 & prev] <- paste(reason[hit2 & prev], sprintf("PC2 %.1f MAD from median", d2[hit2 & prev]), sep = "; ")
  prev <- !is.na(reason)
  reason[hitc & !prev] <- sprintf("median sample correlation %.3f, %.1f MAD below median", med_cor[hitc & !prev], dc[hitc & !prev])
  reason[hitc & prev] <- paste(reason[hitc & prev], sprintf("low median sample correlation %.3f", med_cor[hitc & prev]), sep = "; ")
  data.frame(sample = sample_ids, pc1_mad = unname(d1), pc2_mad = unname(d2),
             cor_mad = unname(dc), reason = reason, stringsAsFactors = FALSE)
}

apply_exclusion_rule <- function(flag_df) {
  # Exclude flagged samples, unless >5% of the cohort is flagged (then exclude
  # none and mark them 'flagged, not excluded (>5% rule)').
  n <- nrow(flag_df)
  flagged <- !is.na(flag_df$reason)
  if (sum(flagged) / n > 0.05) {
    reasons <- ifelse(flagged, paste0(flag_df$reason, " [flagged, not excluded (>5% rule)]"), NA_character_)
    list(excluded = rep(FALSE, n), reasons = reasons,
         note = sprintf("%d/%d flagged (>5%%): excluded none", sum(flagged), n))
  } else {
    list(excluded = flagged, reasons = flag_df$reason,
         note = sprintf("%d/%d flagged and excluded", sum(flagged), n))
  }
}

# --- QC plots -------------------------------------------------------------------

qc_plots <- function(E, group, cohort, outdir) {
  # PCA (colored by group, flagged samples labelled) + density plot. Returns
  # the flag data.frame from detect_outliers().
  dir.create(outdir, showWarnings = FALSE, recursive = TRUE)
  flags <- detect_outliers(E, colnames(E))
  vars <- matrixStats::rowVars(E, na.rm = TRUE); vars[!is.finite(vars)] <- 0
  k <- min(2000L, sum(vars > 0))
  pc <- stats::prcomp(t(E[order(vars, decreasing = TRUE)[seq_len(k)], , drop = FALSE]),
                      center = TRUE, scale. = FALSE)
  ve <- 100 * pc$sdev^2 / sum(pc$sdev^2)
  flagged <- !is.na(flags$reason)
  grDevices::png(file.path(outdir, sprintf("%s__pca.png", cohort)), width = 900, height = 700)
  cols <- ifelse(group == "AD", "#ca3a2b", "#2b6cb0")
  plot(pc$x[, 1], pc$x[, 2], col = cols, pch = 19,
       xlab = sprintf("PC1 (%.1f%%)", ve[1]), ylab = sprintf("PC2 (%.1f%%)", ve[2]),
       main = sprintf("%s: PCA of filtered log-expression (n=%d)", cohort, ncol(E)))
  graphics::legend("topright", c("AD", "control"), col = c("#ca3a2b", "#2b6cb0"), pch = 19)
  if (any(flagged)) {
    graphics::points(pc$x[flagged, 1], pc$x[flagged, 2], cex = 2, lwd = 2)
    graphics::text(pc$x[flagged, 1], pc$x[flagged, 2], colnames(E)[flagged], pos = 3, cex = 0.7)
  }
  grDevices::dev.off()
  grDevices::png(file.path(outdir, sprintf("%s__density.png", cohort)), width = 900, height = 600)
  limma::plotDensities(E, group = group, legend = "topright",
                       main = sprintf("%s: per-sample expression densities", cohort))
  grDevices::dev.off()
  flags
}

# --- gene mapping -----------------------------------------------------------------

map_probes_gpl10558 <- function(probe_ids, annot_path) {
  # Map Illumina probe IDs via the GPL10558 annot 'Gene ID' column. Keeps
  # probes with exactly one Entrez ID (drops empty and '///' multi-maps).
  # Returns data.frame(probe, entrez, symbol) for mapped probes.
  con <- gzfile(annot_path, "rt")
  all_lines <- readLines(con)
  close(con)
  begin <- which(all_lines == "!platform_table_begin")
  stopifnot(length(begin) == 1)
  body <- all_lines[(begin + 1):length(all_lines)]
  body <- body[!grepl("^!platform_table_end", body)]
  annot <- utils::read.table(text = body,
                             header = TRUE, sep = "\t", quote = "", comment.char = "",
                             stringsAsFactors = FALSE, colClasses = "character",
                             fill = TRUE, check.names = FALSE)
  names(annot) <- trimws(names(annot))
  id_col <- which(names(annot) == "ID")[1]
  sym_col <- which(tolower(names(annot)) == "gene symbol")[1]
  gid_col <- which(tolower(names(annot)) == "gene id")[1]
  stopifnot(length(id_col) == 1, length(sym_col) == 1, length(gid_col) == 1)
  m <- match(probe_ids, annot[[id_col]])
  gid <- annot[[gid_col]][m]
  sym <- annot[[sym_col]][m]
  ok <- !is.na(gid) & nzchar(trimws(gid)) & !grepl("///", gid, fixed = TRUE)
  data.frame(probe = probe_ids[ok], entrez = trimws(gid[ok]), symbol = sym[ok],
             stringsAsFactors = FALSE)
}

map_symbols_to_entrez <- function(symbols) {
  # SYMBOL map first (multiVals='first'), then ALIAS only for still-unmapped
  # symbols, accepting an alias solely when it resolves to exactly one Entrez.
  # Returns data.frame(symbol, entrez) with entrez possibly NA (still unmapped).
  suppressMessages(requireNamespace("org.Hs.eg.db", quietly = TRUE))
  suppressMessages(requireNamespace("AnnotationDbi", quietly = TRUE))
  uniq <- unique(symbols)
  entrez <- suppressWarnings(AnnotationDbi::mapIds(org.Hs.eg.db::org.Hs.eg.db,
                                                   keys = uniq, column = "ENTREZID",
                                                   keytype = "SYMBOL", multiVals = "first"))
  still <- uniq[is.na(entrez)]
  if (length(still) > 0) {
    alias_hits <- suppressWarnings(AnnotationDbi::select(
      org.Hs.eg.db::org.Hs.eg.db, keys = still, columns = "ENTREZID", keytype = "ALIAS"))
    alias_hits <- alias_hits[!is.na(alias_hits$ENTREZID), , drop = FALSE]
    if (nrow(alias_hits) > 0) {
      tab <- table(alias_hits$ALIAS)
      unique_alias <- names(tab)[tab == 1]
      fix <- alias_hits[alias_hits$ALIAS %in% unique_alias, , drop = FALSE]
      entrez[match(fix$ALIAS, uniq)] <- fix$ENTREZID
    }
  }
  data.frame(symbol = uniq, entrez = unname(entrez), stringsAsFactors = FALSE)
}

collapse_by_max_mean <- function(E, entrez, symbol) {
  # One row per Entrez id: keep the row with highest mean expression.
  m <- rowMeans(E, na.rm = TRUE)
  ord <- order(entrez, -m)
  keep <- !duplicated(entrez[ord])
  idx <- ord[keep]
  list(E = E[idx, , drop = FALSE], entrez = entrez[idx], symbol = symbol[idx])
}

# --- fits ---------------------------------------------------------------------------

fit_limma <- function(E, group, cov_df, trend = FALSE) {
  # AD-minus-control limma fit; coef 'groupAD'. eBayes robust=TRUE.
  design <- design_for(group, cov_df)
  fit <- limma::lmFit(E, design)
  fit <- limma::eBayes(fit, trend = trend, robust = TRUE)
  tt <- limma::topTable(fit, coef = "groupAD", number = Inf, sort.by = "none",
                        adjust.method = "BH")
  list(table = tt, design = design)
}

deseq2_to_table <- function(res) {
  # results() -> contract columns. Genes with NA padj (independent filtering)
  # keep their stat but get fdr = 1.
  n_if <- sum(is.na(res$padj) & !is.na(res$pvalue))
  fdr <- res$padj
  fdr[is.na(fdr)] <- 1
  list(log2fc = unname(res$log2FoldChange), stat = unname(res$stat),
       p_value = unname(res$pvalue), fdr = unname(fdr),
       mean_expr = unname(log2(res$baseMean + 1)), n_if_fdr1 = unname(n_if))
}

fit_deseq2 <- function(counts, group, cov_df) {
  # counts: genes x samples, integers. design ~ <covariates> + group.
  group <- factor(group, levels = c("control", "AD"))
  col_data <- if (ncol(cov_df) == 0) data.frame(group = group) else cbind(cov_df, group = group)
  rownames(col_data) <- colnames(counts)
  cov_names <- setdiff(colnames(col_data), "group")
  form <- stats::reformulate(c(cov_names, "group"))
  dds <- DESeq2::DESeqDataSetFromMatrix(countData = counts, colData = col_data, design = form)
  dds <- DESeq2::DESeq(dds)
  res <- DESeq2::results(dds, name = "group_AD_vs_control", alpha = 0.05,
                         independentFiltering = TRUE, cooksCutoff = TRUE)
  list(res = res, table = deseq2_to_table(res), dds = dds, results_names = DESeq2::resultsNames(dds))
}

# --- output contract ------------------------------------------------------------------

finalize_main_table <- function(entrez, symbol, log2fc, stat, p_value, fdr,
                                mean_expr, method) {
  df <- data.frame(
    entrez_id = as.character(entrez),
    symbol = as.character(symbol),
    log2fc = as.numeric(log2fc),
    stat = as.numeric(stat),
    p_value = as.numeric(p_value),
    fdr = as.numeric(fdr),
    mean_expr = as.numeric(mean_expr),
    method = as.character(method),
    stringsAsFactors = FALSE
  )
  stopifnot(!any(is.na(df$entrez_id)), all(nzchar(df$entrez_id)))
  df
}

check_main_contract <- function(df) {
  expected <- c(entrez_id = "character", symbol = "character", log2fc = "numeric",
                stat = "numeric", p_value = "numeric", fdr = "numeric",
                mean_expr = "numeric", method = "character")
  stopifnot(identical(colnames(df), names(expected)))
  for (nm in names(expected)) {
    ok <- if (expected[[nm]] == "character") is.character(df[[nm]]) else is.numeric(df[[nm]])
    if (!ok) stop(sprintf("column %s must be %s", nm, expected[[nm]]))
  }
  invisible(TRUE)
}

check_samples_contract <- function(df) {
  required <- c("sample_id", "group", "included", "exclusion_reason",
                "age", "sex", "pmi", "rin", "batch")
  missing <- setdiff(required, colnames(df))
  if (length(missing)) stop(sprintf("samples missing cols: %s", paste(missing, collapse = ", ")))
  stopifnot(is.character(df$sample_id), is.character(df$group), is.logical(df$included))
  stopifnot(all(df$group %in% c("AD", "control")))
  invisible(TRUE)
}

# --- sign check --------------------------------------------------------------------------

SIGN_GENES <- data.frame(
  symbol = c("GFAP", "CD44", "SERPINA3", "SST", "VGF", "NPTX2", "BDNF"),
  expected = c("up", "up", "up", "down", "down", "down", "down"),
  stringsAsFactors = FALSE
)

sign_check_table <- function(main_df, genes = SIGN_GENES) {
  # One row per marker gene: symbol, expected direction, stat, fdr, matches.
  # Contrast is AD minus control, so expected-up genes must have stat > 0.
  out <- genes
  out$stat <- NA_real_
  out$fdr <- NA_real_
  out$matches <- NA
  for (i in seq_len(nrow(genes))) {
    hit <- which(main_df$symbol == genes$symbol[i])
    if (length(hit) == 0) next
    j <- hit[which.max(abs(main_df$stat[hit]))]
    out$stat[i] <- main_df$stat[j]
    out$fdr[i] <- main_df$fdr[j]
    out$matches[i] <- if (genes$expected[i] == "up") main_df$stat[j] > 0 else main_df$stat[j] < 0
  }
  out
}
