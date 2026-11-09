# Contracts (frozen Nov 5 2026)

The API (WS6) and web app (WS7) build against these while workstreams 1–5 compute real data.
Changes go through the engineering lead.

- [openapi.yaml](openapi.yaml): the six endpoints, plus `/health`
- [algorithms.md](algorithms.md): every method, formula, threshold and seed
- [parquet/README.md](parquet/README.md): every processed table
- `fixtures/`: mock responses; WS6 generates them from a mock truth table, and they must validate against openapi.yaml

## Decisions taken (defaults; the science lead may revise them before the preregistration hash)

1. **GSE173955** has no counts on GEO (TPM only, 8 AD + 10 non-AD), so it uses limma-trend on log2(TPM+1).
2. **GSE53697** counts are partly non-integer. The pipeline rounds them before DESeq2 and logs the rounding.
3. **LINCS context split.** 30% of each compound's contexts are held out (always leaving ≥ 3 for
   ranking, seed 20261105). They never enter the ranking, the score scaling or θ.
4. **Survive rules** are set per context type (algorithms.md §3). Signature-type contexts use a top-25%
   rule (`top_25pct_compounds` in the preregistration), LINCS contexts use consensus ≤ θ, and brain exposure uses a threshold on measured evidence.
5. **Join key.** Entrez Gene ID, stored as a string. HGNC symbol and Ensembl are extra columns.
6. **Approval status** comes from ChEMBL `max_phase`, not DrugBank.
7. **Brain exposure on the evidence card.** The card shows only the *predicted* level before an
   attack. Measured CNS exposure is a hidden validation context, so showing it up front would
   leak a hidden outcome.
8. **Score sign.** For every score, negative = reversal, matching the demo script. The plan's
   R(d) = mean of Z(−τ), Z(GSEA), Z(−cos) gives the same ranking with the sign flipped.
