# Integrity log

Every change made to the method after looking at data, in order. This includes what was seen and
who decided. The benchmark pool (clinical-stage pool ranks 1–50) stayed sealed until the
preregistration was frozen.

| # | When (Nov 5) | What we saw | Change | Data looked at | Decided by |
|---|---|---|---|---|---|
| 1 | contract | Mock benchmark: 74% of synthetic candidates were decided before any test | Primary analysis = candidates undecided before testing | synthetic only | lead, spec |
| 2 | signatures | GSE53697: 0 genes at FDR < 0.05; ρ = −0.002 with GSE132903 | Cohort QC gate; GSE53697 out of the hidden tests | signatures only | lead, spec |
| 3 | spec | Most drugs lack measured brain exposure | "No measured data" means untestable, not failure | none | lead, spec |
| 4 | synthetic | Plan's learn formula ≈ random on fresh synthetic worlds | Decision-aware strategy added as co-primary | synthetic only (seeds 9001–9005) | the person |
| 5 | first ranking | Top 30: 23 unnamed screening compounds | Candidate pool = clinical stage ≥ phase 1 (Open Targets 26.09) | ranking only, no hidden outcome | the person |
| 6 | GSE173955 | 98% of genes "down in AD" (TPM compositional artifact) | Quantile-normalize log2(TPM+1). Its FDR genes fell from 2,182 to 0 | signature only | lead (bug fix) |
| 7 | after #6 | FDR gate would remove every held-out cohort | Gate = Spearman ρ ≥ 0.2 with the primary (GSE173955 0.50 in, GSE53697 out) | signatures only | the person |
| 8 | permutation control | All signatures: 0/20 of the clinical pool's top 20 beat the selection-aware rank-matched null | Gold LINCS signatures only (15/20 beat it). Neither passes the strict "all top 20 at p < 0.05" gate. See "Permutation control numbers" below for exact definitions | ranking and permutation null only | the person |
| 9 | development pool | Claim held for 4% of development drugs, 0% undecided before testing | Survive = top 25% / θ at the 25th null percentile, q = 0.7 (no-effect claim rate ≈ 5%) | development pool only (pool ranks 51–100) | the person |
| 10 | development pool | — | λ = 0.5, λ_lookahead = 0, type priors from development survive rates | development pool only | rule in spec |
| 11 | freeze | — | `preregistration.yaml` frozen, sha256 `21f7460e…bb8a3`, commit `8ed0885` | — | the person |
| 12 | after freeze | Benchmark code had ignored the preregistration and used code defaults; early-ending runs were scored wrong; the guard misparsed the file | Code fixes only. The frozen file was untouched | — | lead (bug fixes) |
| 13 | after freeze | The truth table had been built while exposure extraction was still running. The final evidence build removed one misclassified assay (plaque binding read as brain/plasma Kp), which changed one brain-exposure outcome (resveratrol, benchmark pool) | Benchmark re-run on the final truth table under the same frozen rules. All results unchanged to 2 decimals. The earlier summary is kept as `benchmark_summary__before_exposure_fix.json` | — | lead (data fix) |

## Headline result (frozen rules, final truth table)

- **Pool:** 50 sealed candidates, 46 undecided before testing (primary analysis), 20 seeds, budget 5.
- **tauchstone_hybrid (the plan's formula):**
  - fewer experiments to a correct verdict than random (Holm p = 0.0009) and than confirmation-seeking `greedy_strongest` (p = 0.002)
  - decision accuracy after 5 tests: 1.00, vs random 0.88 and greedy 0.80
  - ties max_failure and max_uncertainty
- **decision_lookahead_hybrid (co-primary):** better than greedy (p = 0.004), not better than random (p = 0.25), accuracy 0.87. It led on the development pool but did not hold up on the sealed pool. Reported as is.

## Permutation control numbers

Produced by `uv run python -m pipelines.lincs.permutation_report` from the saved permutation
files (200 label permutations of GSE132903, seed 20261105).

- **Compound p_perm:** for each of the scope's top 20 compounds,
  p = (1 + #permutations where that compound's null consensus ≤ its real consensus) / 201.
- **Selection-aware rank-matched check:** for k = 1..20, the real k-th best consensus is compared
  with the 5th percentile, across permutations, of the k-th best consensus among *all* compounds in
  the scope. This asks whether shuffled labels would produce top scores this extreme anywhere in the
  pool, which accounts for choosing the top 20 out of thousands. (A weaker variant compares the same
  20 compounds with their own null values; it is not the one quoted here.)

| run | scope | compounds | top 20 with p_perm < 0.05 | top 20 beating rank-matched null |
|---|---|---|---|---|
| all signatures | all ranked | 16,482 | 18/20 | 0/20 |
| all signatures | clinical pool | 2,508 | 14/20 | 0/20 |
| **gold only (used)** | all ranked | 5,690 | 16/20 | 16/20 |
| **gold only (used)** | **clinical pool** | **1,816** | **17/20** | **15/20** |

The preregistered gate ("every top-20 compound at p < 0.05") is not met in any row.
