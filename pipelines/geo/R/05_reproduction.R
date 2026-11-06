# Reproduction report: Spearman correlation of gene stats between GSE132903
# and each held-out cohort over shared genes, FDR<0.05 overlap, and
# concordant-sign fraction. REPORT ONLY -- never tuned toward.
#
# Run from the repo root: Rscript pipelines/geo/R/05_reproduction.R

source("pipelines/geo/R/common.R")
suppressMessages({ library(nanoparquet); library(jsonlite) })

sig_dir <- SIG_DIR()
main132903 <- nanoparquet::read_parquet(file.path(sig_dir, "GSE132903__main.parquet"))
held <- c("GSE173955", "GSE53697")

lines <- c("# Reproduction: primary signature vs held-out cohorts",
           "",
           "Spearman rho of `stat` over shared genes (cor.test, method='spearman'),",
           "FDR<0.05 overlap, and concordant-sign fraction. Report only; nothing was",
           "tuned toward these values. Held-out cohorts never fed signature",
           "construction, thresholds, or candidate choice.",
           "")
rows <- list()
for (h in held) {
  mh <- nanoparquet::read_parquet(file.path(sig_dir, paste0(h, "__main.parquet")))
  shared <- intersect(main132903$entrez_id, mh$entrez_id)
  a <- main132903[match(shared, main132903$entrez_id), ]
  b <- mh[match(shared, mh$entrez_id), ]
  finite <- is.finite(a$stat) & is.finite(b$stat)
  a <- a[finite, ]; b <- b[finite, ]
  cat(sprintf("[repro] %s: %d shared genes, %d with finite stat in both\n",
              h, length(shared), nrow(a)))
  ct <- stats::cor.test(a$stat, b$stat, method = "spearman")
  fa <- a$fdr < 0.05 & !is.na(a$fdr)
  fb <- b$fdr < 0.05 & !is.na(b$fdr)
  both <- fa & fb
  conc <- mean(sign(a$stat[both]) == sign(b$stat[both]))
  conc_str <- if (sum(both) == 0) "NA (no doubly-FDR genes)" else sprintf("%.4f", conc)
  rows[[h]] <- data.frame(pair = sprintf("GSE132903 vs %s", h), n_shared = length(shared),
                          rho = unname(ct$estimate), p_value = ct$p.value,
                          fdr05_primary = sum(fa), fdr05_heldout = sum(fb),
                          fdr05_both = sum(both), concordant_frac = conc,
                          conc_str = conc_str,
                          stringsAsFactors = FALSE)
  cat(sprintf("[repro] %s: n_shared=%d rho=%.3f p=%.2g fdr05=(%d,%d,both %d) concord=%.3f\n",
              h, length(shared), ct$estimate, ct$p.value,
              sum(fa), sum(fb), sum(both), conc))
}
tab <- do.call(rbind, rows)
lines <- c(lines,
  "| pair | n_shared | spearman_rho | p_value | FDR<0.05 primary | FDR<0.05 held-out | FDR<0.05 both | concordant_sign_frac |",
  "|---|---|---|---|---|---|---|---|",
  sprintf("| %s | %d | %.4f | %.3g | %d | %d | %d | %s |", tab$pair, tab$n_shared,
          tab$rho, tab$p_value, tab$fdr05_primary, tab$fdr05_heldout,
          tab$fdr05_both, tab$conc_str),
  "",
  "## Per-cohort sign checks (AD minus control)",
  "")
for (co in c("GSE132903", held)) {
  m <- nanoparquet::read_parquet(file.path(sig_dir, paste0(co, "__main.parquet")))
  sc <- sign_check_table(m)
  lines <- c(lines, sprintf("### %s (%d/%d markers match)", co,
                            sum(sc$matches, na.rm = TRUE), nrow(sc)),
    "",
    "| symbol | expected | stat | fdr | matches |",
    "|---|---|---|---|---|",
    sprintf("| %s | %s | %.3f | %.3g | %s |", sc$symbol, sc$expected, sc$stat, sc$fdr,
            ifelse(is.na(sc$matches), "missing", ifelse(sc$matches, "yes", "NO"))),
    "")
}
writeLines(lines, file.path(sig_dir, "reproduction.md"))
cat("[repro] wrote reproduction.md\n")
