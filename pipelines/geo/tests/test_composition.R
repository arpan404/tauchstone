# Tier 2: a gene whose group difference is fully explained by a cell-score
# covariate must lose significance after composition adjustment.

candidates <- c("pipelines/geo/R/common.R",
                "../../pipelines/geo/R/common.R",
                "../../../pipelines/geo/R/common.R")
common_path <- candidates[file.exists(candidates)][1]
if (is.na(common_path)) stop("cannot find pipelines/geo/R/common.R")
source(common_path)

library(testthat)

test_that("adjustment removes a group effect fully explained by a cell score", {
  set.seed(20261105)
  n0 <- 30; n1 <- 30
  group <- rep(c("control", "AD"), c(n0, n1))
  # cell score differs by group (fewer 'neurons' in AD) + noise
  score <- c(rnorm(n0, 0.5, 0.3), rnorm(n1, -0.5, 0.3))
  E <- matrix(rnorm(200 * (n0 + n1), 7, 0.5), 200, n0 + n1)
  # gene 1: pure composition effect, no direct group effect
  E[1, ] <- 2 * score + rnorm(n0 + n1, 0, 0.3)
  # gene 2: direct group effect on top of composition
  E[2, ] <- 2 * score + ifelse(group == "AD", 1.5, 0) + rnorm(n0 + n1, 0, 0.3)

  before <- fit_limma(E, group, data.frame()[seq_len(n0 + n1), , drop = FALSE])
  after <- fit_limma(E, group, data.frame(neu = score))
  # gene 1 significant before, gone after
  expect_lt(before$table$P.Value[1], 0.01)
  expect_gt(after$table$P.Value[1], 0.1)
  # gene 2 stays significant after adjustment
  expect_lt(after$table$P.Value[2], 0.01)
  # design keeps groupAD last
  expect_equal(colnames(after$design),
               c("(Intercept)", "neu", "groupAD"))
})
