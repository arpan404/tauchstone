# One-time R setup: creates the renv project at the repo root and pins every package
# in renv.lock. Afterwards, anyone (or any agent worktree) runs `make setup-r`, which
# calls renv::restore() and reuses renv's global package cache.

options(repos = c(CRAN = "https://cloud.r-project.org"), Ncpus = 12)
Sys.setenv(MAKEFLAGS = "-j12")

# macOS: keep conda out of native builds. If miniconda/anaconda is on PATH, its
# pkg-config makes xml2 (needed by GEOquery) link against conda's libxml2, which
# then fails to load. Use Homebrew's pkg-config and libxml2 instead.
path <- strsplit(Sys.getenv("PATH"), ":")[[1]]
Sys.setenv(PATH = paste(path[!grepl("conda", path)], collapse = ":"))
brew_xml <- "/opt/homebrew/opt/libxml2/lib/pkgconfig"
if (dir.exists(brew_xml)) {
  Sys.setenv(PKG_CONFIG_PATH = brew_xml, PKG_CONFIG = "/opt/homebrew/bin/pkg-config")
}

if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv")

if (file.exists("renv.lock")) {
  renv::restore(prompt = FALSE)
  quit(save = "no")
}

if (!file.exists("renv/activate.R")) {
  renv::init(bare = TRUE, restart = FALSE, bioconductor = TRUE)
}
renv::settings$snapshot.type("all")

pkgs <- c(
  # Differential expression
  "bioc::limma", "bioc::edgeR", "bioc::DESeq2",
  # GEO access and gene ID mapping (Entrez is the project-wide join key)
  "bioc::GEOquery", "bioc::AnnotationDbi", "bioc::org.Hs.eg.db", "bioc::illuminaHumanv4.db",
  # IO and utilities
  "nanoparquet", "readxl", "data.table", "jsonlite", "yaml", "matrixStats", "optparse",
  # Tests
  "testthat"
)
renv::install(pkgs, prompt = FALSE)
renv::snapshot(prompt = FALSE)

for (p in c("limma", "edgeR", "DESeq2", "GEOquery", "org.Hs.eg.db", "nanoparquet")) {
  cat(sprintf("%-14s %s\n", p, as.character(packageVersion(p))))
}
