# Run the full WS2 pipeline in dependency order. Run from the repo root so
# .Rprofile activates renv:
#   Rscript pipelines/geo/R/run_all.R
# (Makefile `signatures` target calls this.)

repo <- getwd()
stopifnot(file.exists(file.path(repo, "pipelines/geo/R/common.R")))
for (s in c("01_gse132903.R", "02_gse53697.R", "03_gse173955.R",
            "04_permutations.R", "05_reproduction.R", "06_composition.R")) {
  cat(sprintf("===== %s =====\n", s))
  source(file.path(repo, "pipelines/geo/R", s))
}
cat("===== all WS2 scripts finished =====\n")
