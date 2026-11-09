`paired_response.json` preserves the first three nodes of a real paired-query response
from https://perturbseqr.maayanlab.cloud/graphql, fetched 2026-11-07. It is a deliberate
excerpt and keeps the original totalCount. It contains two chemicals and a gene
perturbation so tests check that gene results cannot enter drug rankings. Full responses
and SHA-256 metadata live outside git in $TS_DATA_DIR/raw/resources/perturbseqr/.
