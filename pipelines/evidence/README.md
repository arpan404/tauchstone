# pipelines/evidence

WS4 Evidence cards for the top 50: ChEMBL targets + max_phase + BBB assays, HPA brain expression, Open Targets AD score, UniProt/PDB structure. Cache all responses locally. Output: processed/evidence/*.parquet.

Read /AGENTS.md first.

`sourcing.py`: purity and sourcing check per LINCS compound from the Broad Drug Repurposing Hub sample QC (2020-03-24). Output: processed/evidence/sourcing.parquet. Display only; feeds no ranking, threshold, pool, truth table or verdict.
