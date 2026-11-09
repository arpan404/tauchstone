# pipelines/evidence

WS4 builds evidence cards for the top 50 candidates from ChEMBL targets, max_phase and BBB assays, HPA brain expression, the Open Targets AD score and UniProt/PDB structures. Cache every response locally. Output goes to processed/evidence/*.parquet.

Read /AGENTS.md first.

`sourcing.py` checks purity and sourcing for each LINCS compound against the Broad Drug Repurposing Hub sample QC (2020-03-24). Output goes to processed/evidence/sourcing.parquet. It is for display only and feeds no ranking, threshold, pool, truth table or verdict.
