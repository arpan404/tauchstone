# Unit tests for WS2 helpers: sign convention, covariates, outliers, contracts.
# Lightweight: no DESeq2/org.Hs.eg.db loads here (covered by test_toolchain.R).

candidates <- c("pipelines/geo/R/common.R",
                "../../pipelines/geo/R/common.R",
                "../../../pipelines/geo/R/common.R")
common_path <- candidates[file.exists(candidates)][1]
if (is.na(common_path)) stop("cannot find pipelines/geo/R/common.R")
source(common_path)

library(testthat)

test_that("design_for puts group last and yields a groupAD coefficient", {
  set.seed(7)
  group <- rep(c("control", "AD"), each = 6)
  cov <- data.frame(age = rnorm(12, 80, 5), sex = factor(rep(c("f", "m"), 6)))
  d <- design_for(group, cov)
  expect_equal(colnames(d), c("(Intercept)", "age", "sexm", "groupAD"))
})

test_that("limma helper keeps AD-minus-control sign on planted effects", {
  set.seed(11)
  group <- rep(c("control", "AD"), each = 6)
  E <- matrix(rnorm(100 * 12), 100, 12)
  E[1, group == "AD"] <- E[1, group == "AD"] + 2   # up in AD
  E[2, group == "AD"] <- E[2, group == "AD"] - 2   # down in AD
  fit <- fit_limma(E, group, data.frame()[seq_len(12), , drop = FALSE])
  expect_gt(fit$table$t[1], 3)
  expect_lt(fit$table$t[2], -3)
  # covariates do not flip the sign (balanced w.r.t. group)
  cov <- data.frame(age = rep(seq_len(6), 2))
  fit2 <- fit_limma(E, group, cov)
  expect_gt(fit2$table$t[1], 3)
  expect_lt(fit2$table$t[2], -3)
})

test_that("resolve_covariates uses complete covariates, marks the rest unspecified", {
  inc <- rep(TRUE, 6)
  res <- resolve_covariates(list(age = c(80, 81, 82, 83, 84, 85),
                                 sex = c("f", "m", "f", "m", "f", "m"),
                                 pmi = NULL, rin = rep(NA_real_, 6),
                                 batch = rep("b1", 6)), inc)
  expect_equal(sort(colnames(res$used)), c("age", "sex"))
  expect_true(all(c("pmi", "rin", "batch") %in% res$unspecified))
  # NA among included -> unspecified; NA only outside included is fine
  inc2 <- c(TRUE, TRUE, TRUE, FALSE, FALSE, FALSE)
  res2 <- resolve_covariates(list(age = c(80, 81, 82, NA, NA, NA)), inc2)
  expect_equal(colnames(res2$used), "age")
  res3 <- resolve_covariates(list(age = c(80, 81, NA, 90, 91, 92)), inc)
  expect_equal(ncol(res3$used), 0)
  expect_equal(res3$unspecified, "age")
})

test_that("detect_outliers flags a planted outlier and apply_exclusion_rule respects >5%", {
  set.seed(13)
  E <- matrix(rnorm(3000 * 20, mean = 7, sd = 0.5), 3000, 20)
  E[, 20] <- E[, 20] + 8  # gross outlier sample
  colnames(E) <- paste0("s", 1:20)
  flags <- detect_outliers(E, colnames(E))
  expect_true(!is.na(flags$reason[20]))
  rule <- apply_exclusion_rule(flags)
  expect_true(rule$excluded[20])
  expect_false(any(rule$excluded[-20]))
  # >5% flagged -> exclude none
  flags2 <- flags
  flags2$reason[1:2] <- "test flag"
  rule2 <- apply_exclusion_rule(flags2)
  expect_false(any(rule2$excluded))
  expect_true(grepl("excluded none", rule2$note))
})

test_that("parse_age_years handles 90+ and garbage", {
  expect_equal(parse_age_years(c("82", "90+", NA, "xx")), c(82, 90, NA, NA))
})

test_that("main/samples contract checks accept good tables and reject bad ones", {
  main <- finalize_main_table(entrez = c("2670", "6750"), symbol = c("GFAP", "SST"),
                              log2fc = c(0.5, -0.4), stat = c(4, -3),
                              p_value = c(1e-4, 1e-3), fdr = c(0.01, 0.02),
                              mean_expr = c(9, 8), method = "limma")
  expect_silent(check_main_contract(main))
  expect_true(is.character(main$entrez_id))
  bad <- main[, -1]
  expect_error(check_main_contract(bad))
  samp <- data.frame(sample_id = "GSM1", group = "AD", included = TRUE,
                     exclusion_reason = NA_character_, age = 80, sex = "female",
                     pmi = NA_real_, rin = NA_real_, batch = NA_character_,
                     stringsAsFactors = FALSE)
  expect_silent(check_samples_contract(samp))
  samp$group <- "weird"
  expect_error(check_samples_contract(samp))
})

test_that("sign_check_table recovers planted directions", {
  main <- finalize_main_table(entrez = c("2670", "6750", "999999"),
                              symbol = c("GFAP", "SST", "OTHER"),
                              log2fc = c(0.5, -0.4, 0.1), stat = c(4, -3, 0.5),
                              p_value = c(1e-4, 1e-3, 0.5), fdr = c(0.01, 0.02, 0.6),
                              mean_expr = c(9, 8, 7), method = "limma")
  sc <- sign_check_table(main)
  expect_equal(nrow(sc), 7)
  expect_true(sc$matches[sc$symbol == "GFAP"])
  expect_true(sc$matches[sc$symbol == "SST"])
})

test_that("deseq2_to_table maps NA padj to fdr=1 and keeps stat", {
  res <- list(log2FoldChange = c(0.5, -0.2), stat = c(2.5, -1.1),
              pvalue = c(0.01, NA), padj = c(0.05, NA),
              baseMean = c(100, 50))
  tab <- deseq2_to_table(res)
  expect_equal(tab$fdr, c(0.05, 1))
  expect_equal(tab$stat, c(2.5, -1.1))
  expect_equal(tab$mean_expr, log2(c(101, 51)))
  expect_equal(tab$n_if_fdr1, 0)
})

test_that("map_probes_gpl10558 keeps exactly-one-Entrez probes", {
  f <- tempfile(fileext = ".annot.gz")
  con <- gzfile(f, "wt")
  writeLines(c("!Annotation_platform = TEST", "!platform_table_begin",
               "ID\tGene symbol\tGene ID", "p1\tGFAP\t2670",
               "p2\t\t", "p3\tX\t1///2", "p4\tSST\t6750",
               "!platform_table_end"), con)
  close(con)
  m <- map_probes_gpl10558(c("p1", "p2", "p3", "p4", "pX"), f)
  expect_equal(m$probe, c("p1", "p4"))
  expect_equal(m$entrez, c("2670", "6750"))
})
