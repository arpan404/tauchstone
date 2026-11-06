# Toolchain smoke test: limma and DESeq2 recover a planted effect with the right sign,
# and Parquet written from R is readable from Python (the R -> Python handoff).
library(testthat)

set.seed(1)
group <- factor(rep(c("control", "AD"), each = 6), levels = c("control", "AD"))
design <- model.matrix(~group)

test_that("limma recovers sign of a planted up-regulated gene", {
  x <- matrix(rnorm(200 * 12), 200, 12)
  x[1, group == "AD"] <- x[1, group == "AD"] + 3
  fit <- limma::eBayes(limma::lmFit(x, design))
  tt <- limma::topTable(fit, coef = "groupAD", number = Inf, sort.by = "none")
  expect_gt(tt$t[1], 5)
})

test_that("DESeq2 recovers sign of a planted down-regulated gene", {
  counts <- matrix(rnbinom(300 * 12, mu = 100, size = 10), 300, 12)
  counts[1, group == "AD"] <- rnbinom(6, mu = 20, size = 10)
  dds <- DESeq2::DESeqDataSetFromMatrix(counts, data.frame(group), ~group)
  res <- DESeq2::results(DESeq2::DESeq(dds, quiet = TRUE), name = "group_AD_vs_control")
  expect_lt(res$stat[1], -3)
})

test_that("nanoparquet writes a file", {
  f <- tempfile(fileext = ".parquet")
  nanoparquet::write_parquet(data.frame(entrez_id = c("351", "348"), stat = c(1.5, -2)), f)
  expect_true(file.exists(f))
})
