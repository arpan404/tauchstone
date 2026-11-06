# Contracts (freeze before parallel work starts)

Workstreams 6 (API) and 7 (web) build against these while 1–5 compute real data.
Changes after freeze go through the engineering lead.

To write here:
- `parquet/*.md` — one schema per processed table (columns, types, keys, units, sign convention)
- `openapi.yaml` — the six endpoints from the build plan + provenance object
- `fixtures/*.json` — mock responses matching `openapi.yaml`
- `truth_table.md` — hidden outcome schema

## Decisions to settle in the contract

1. **GSE173955 has no counts on GEO** (TPM only, 8 AD + 10 non-AD). Tier 1: limma-trend on
   log2(TPM+1). Optional upgrade: re-quantify from SRA with salmon, then DESeq2.
2. **GSE53697 counts are partly non-integer** (8 control + 9 AD). Round before DESeq2; record it.
3. **LINCS context split.** A drug's held-out LINCS contexts (cell line / dose / time) must be
   excluded from its ranking median, or the Tauchstone test is already inside the ranking.
   Split per drug with a fixed seed, written into `data/manifests/preregistration.yaml`.
4. **Per-context-type survive rule.** The claim formula assumes a reversal score s ≤ θ, which
   fits cohorts and LINCS contexts but not brain exposure (yes/no) or composition-adjusted
   rank. Define pass/fail per context type in the truth-table schema.
5. **Join key:** Entrez Gene ID as string everywhere; HGNC symbol and Ensembl as extra columns.
6. **Approval status from ChEMBL `max_phase`**, not DrugBank (avoids the license question).
