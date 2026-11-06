# GSE132903 label permutations (null for WS3/WS5): 200 shuffles of AD/control
# labels among INCLUDED samples (covariates stay attached to their samples),
# refitting the same limma model on the same filtered/collapsed matrix.
# Output: perm_id (1..200), entrez_id, stat (moderated t for groupAD).
#
# Run from the repo root: Rscript pipelines/geo/R/04_permutations.R

source("pipelines/geo/R/common.R")
suppressMessages({ library(limma); library(nanoparquet); library(jsonlite) })

COHORT <- "GSE132903"
N_PERM <- 200L

sig_dir <- SIG_DIR()
fit <- readRDS(file.path(sig_dir, "_interim", "gse132903_fit.rds"))
E <- fit$E            # filtered/collapsed log-expression, included samples only
group <- fit$group    # factor-compatible vector of "AD"/"control"
cov_df <- fit$cov_df
entrez <- fit$entrez
stopifnot(ncol(E) == length(group), nrow(E) == length(entrez))
stopifnot(all(group %in% c("AD", "control")))

inputs <- read_checksums(c("geo/GSE132903/GSE132903_series_matrix.txt.gz",
                           "geo/GSE132903/GSE132903_Non-normalized_data.txt.gz",
                           "geo/GPL10558/GPL10558.annot.gz"))

set.seed(PERM_SEED)
t0 <- proc.time()
chunks <- vector("list", N_PERM)
for (b in seq_len(N_PERM)) {
  g_perm <- factor(sample(group), levels = c("control", "AD"))
  design <- design_for(g_perm, cov_df)  # covariates stay attached to samples
  ef <- limma::eBayes(limma::lmFit(E, design), robust = TRUE)
  tt <- limma::topTable(ef, coef = "groupAD", number = Inf, sort.by = "none")
  chunks[[b]] <- data.frame(perm_id = b, entrez_id = as.character(entrez),
                            stat = as.numeric(tt$t), stringsAsFactors = FALSE)
  if (b %% 50 == 0) cat(sprintf("[perms] %d/%d done (%.1fs)\n", b, N_PERM,
                                (proc.time() - t0)[["elapsed"]]))
}
perm <- do.call(rbind, chunks)
rownames(perm) <- NULL
stopifnot(nrow(perm) == N_PERM * length(entrez),
          identical(colnames(perm), c("perm_id", "entrez_id", "stat")),
          is.integer(perm$perm_id) || is.numeric(perm$perm_id))

model_str <- "~ <same covariates> + group (labels shuffled among included samples)"
params <- list(n_permutations = N_PERM, n_genes = length(entrez),
               n_samples = length(group),
               ebayes_robust = TRUE, fdr_method = "BH (not stored; t only)")
perm_path <- file.path(sig_dir, paste0(COHORT, "__permutations.parquet"))
write_output(perm, perm_path, step = "label_permutations",
             dataset_accession = COHORT, inputs = inputs,
             sample_filter = "included samples of the main fit; labels shuffled",
             gene_mapping_version = "as GSE132903__main (GPL10558.annot.gz 2016-08-09)",
             model = model_str, parameters = params, random_seed = PERM_SEED)
cat(sprintf("[perms] done: %d rows (%d perms x %d genes)\n",
            nrow(perm), N_PERM, length(entrez)))
