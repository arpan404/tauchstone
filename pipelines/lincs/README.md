# pipelines/lincs

WS3 computes LINCS reversal scores in Python. `gctx.py` reads GCTX files. The pipeline ingests Level 5 signatures and metadata, computes three reversal scores, splits each drug's contexts and aggregates per compound. Output goes to processed/scores/*.parquet.

Read /AGENTS.md first.
