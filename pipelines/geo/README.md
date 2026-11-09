# pipelines/geo

WS2 builds the disease signatures in R. It runs QC, maps probes to Entrez IDs, fits limma for GSE132903 and DESeq2 or limma-trend for the held-out cohorts, and runs the cell-composition sensitivity check. Output goes to processed/signatures/*.parquet, with a QC report.

Read /AGENTS.md first.
