# Algorithms (authoritative spec)

Every workstream implements exactly what is written here. If the data forces a deviation,
document it in the output's provenance and in your final report; do not silently change a rule.
Values marked **(prereg)** are also recorded in `data/manifests/preregistration.yaml` and may not
change after its hash is committed.

Global conventions
- Gene key: Entrez ID as string. Disease signatures are **AD minus control** (positive = higher in AD).
- Reversal scores: **negative = the drug reverses the AD signature**. No step flips this sign.
- Seed **20261105** (prereg) for every random step unless a step says otherwise.
- Every processed file gets a provenance sidecar (`pipelines/common/provenance.py`).

---

## 1. Disease signatures (WS2, R)

Per cohort, separately; cohorts are never merged.

| Cohort | Role | Input | Method |
|---|---|---|---|
| GSE132903 | primary (ranking) | Illumina HT-12 v4 | limma, `eBayes(robust=TRUE)` |
| GSE53697 | held-out 2 | raw counts (rounded) | DESeq2 Wald |
| GSE173955 | held-out 1 | TPM only | limma-trend on log2(TPM+1), `eBayes(trend=TRUE, robust=TRUE)` |

1. **Labels.** `group = factor(levels = c("control", "AD"))`; coefficient `groupAD`. Assert the
   expected counts (97/98, 9/8, 8/10) or stop.
2. **Covariates** age, sex, PMI, RIN, batch: use one only if present for every included sample;
   otherwise record it as `unspecified`. Never impute, never drop samples to fit a covariate.
   Design `~ <covariates> + group`.
3. **Gene mapping.** Arrays: probes with exactly one Entrez ID in GPL10558 annot; collapse to the
   probe with the highest mean. TPM table: symbol → Entrez via org.Hs.eg.db SYMBOL, then ALIAS
   only if unique; on Entrez collisions keep the higher-mean row.
4. **Filtering.** Arrays: detection p < 0.05 in ≥ 20% of samples. Counts: `edgeR::filterByExpr`.
   TPM: TPM ≥ 1 in ≥ 8 samples.
5. **Outliers.** PCA (top 2,000 variable genes). Flag if PC1 or PC2 is > 4 MAD from the median, or
   median inter-sample correlation is > 4 MAD below the median. Exclude flagged samples with a
   recorded reason, unless > 5% would be flagged (then exclude none and report).
6. **Output** `{cohort}__main.parquet`: entrez_id, symbol, log2fc, stat, p_value, fdr, mean_expr, method.
7. **Permutations** (GSE132903 only): 200 label shuffles among included samples, seed 20261105,
   covariates fixed to their samples, same model → `GSE132903__permutations.parquet`
   (perm_id, entrez_id, stat).
8. **Sign check** on GFAP, CD44, SERPINA3 (expect up) and SST, VGF, NPTX2, BDNF (expect down);
   ≥ 5/7 must match in GSE132903 before anything downstream is trusted.
9. **Reproduction**: Spearman ρ of `stat` between GSE132903 and each held-out cohort. Report only.

### 1b. Cell-composition sensitivity (Tier 2, WS2)

Marker sets (prereg): neuron, astrocyte, microglia, oligodendrocyte, from a published brain cell-type
marker list. The list and version are recorded in provenance. Per sample, score = mean of
row-z-scored log expression over the set's genes present. Refit the GSE132903 model with
the four scores added as covariates → `GSE132903__composition_adjusted.parquet` (same columns).

---

## 2. Reversal scoring (WS3, Python)

Gene space: the 978 landmark genes present in the query (Tier 1). X = drug z-scores
(signatures × genes), y = query `stat`.

**Query sets.** Up = top 150 by stat among fdr < 0.05 and stat > 0; down = top 150 by −stat among
fdr < 0.05 and stat < 0. Ties broken by p_value, then entrez_id. If either set has fewer than 10
genes, use the top 150 by stat ignoring FDR and flag it. The permutation control uses the top-150
rule for both the real and the permuted queries.

**Precompute once:** `order = argsort(-X, axis=1)` and its inverse, `rank`, both int16, cached as `.npy`.

**wtcs** (CMap weighted connectivity, Subramanian 2017). For set S (n genes) in row i, walk the
genes in `order`:
P_hit(j) = Σ_{k≤j, g_k∈S} |x_k| / Σ_{g∈S} |x_g|, P_miss(j) = #{k≤j, g_k∉S} / (N − n).
ES_S = the signed value of P_hit − P_miss with the largest absolute value.
wtcs = (ES_up − ES_down) / 2 if the two ES have opposite signs, else 0 (0 if either is exactly 0).

**ks** (Lamb 2006 unweighted). V = sorted 1-based positions of S in the row's ranking, t = |S|:
a = max_j (j/t − V_j/N), b = max_j (V_j/N − (j−1)/t), ks_S = a if a > b else −b.
ks = (ks_up − ks_down) / 2 with the same opposite-sign rule.

**cosine** = X_i · y / (‖X_i‖ ‖y‖) over the shared genes.

**Standardisation.** For each method and query, z = (score − μ) / σ, with μ and σ computed over
**ranking-split signatures only**. Held-out signatures are scaled with the same μ and σ but never
affect them. consensus = mean of the three z-scores; equal weights are fixed in advance (prereg).

**Context split** (prereg). context_id = `cell_id|pert_idose|pert_itime`. For each compound, sort its
contexts and use `default_rng(20261105)` to hold out
`max(0, min(floor(0.3·n), n − 3))` of them. Output: `context_split.parquet`.

**Aggregation.** Context score = mean consensus of that compound's signatures in the context.
Compound score = median over ranking contexts, with IQR. A compound is ranked only if it has
≥ 3 ranking contexts. Rank 1 = most negative.

**Permutation control.** Run the full pipeline per permuted query. For each of the top 50,
p_perm = (1 + #perms with score ≤ real score) / 201. The control passes if every top-20 compound has
p_perm < 0.05. **θ** (prereg) = 5th percentile of the pooled ranking-context consensus across all
permutations.

**Known-positive check.** Compounds reported in prior AD CMap papers should rank above the median.
Report this; never tune toward it.

---

## 3. Truth table (WS5; server-side only)

For each candidate d in the benchmark pool (top 50) and the development pool (ranks 51–100), the
hidden pool S_d (prereg):

| type | contexts | value | survive rule (prereg) |
|---|---|---|---|
| `held_out_cohort` | GSE173955 (GSE53697 excluded by the cohort QC gate below) | d's compound consensus with that cohort's signature as the query (same gene space, split and pipeline) | d is in the 5% most-reversing ranked compounds for that query |
| `composition_adjusted` | GSE132903 adjusted | same, with the adjusted signature | same 5% rule |
| `lincs_context` | d's held-out LINCS contexts, at most 8 (if more, sample 8 stratified by cell line, seed 20261105) | context consensus against the primary signature | consensus ≤ θ |
| `brain_exposure` | 1, only if measured data exists | best measured CNS evidence | survive if measured human CNS PK or measured preclinical brain/plasma Kp ≥ 0.1, or PAMPA-BBB Pe ≥ 4×10⁻⁶ cm/s; fail if measured below those. **No measured data: the context is not in S_d** (it is untestable, not a failure) |
| `cell_type` (stretch) | microglia/astrocyte/neuron pseudobulk | as for cohorts | same 5% rule |

**Cohort QC gate** (prereg, decided on signature quality before any candidate outcome was computed):
a held-out cohort enters S_d only if its own signature has ≥ 100 genes at FDR < 0.05. GSE53697 has
0 (8 vs 9 samples; ρ = −0.002 with GSE132903), so it is reported in the reproduction table but is
not a hidden test. GSE173955 has 2,182 and is included.

Row schema (`processed/tauchstone/truth_table.parquet`): candidate_id, context_id, context_type,
label, value, threshold, outcome (`survive` or `fail`), rule, plus metadata used for similarity:
tissue, region, platform, cell_id, pert_idose, pert_itime. Provenance per row group.

The ranking contexts of d (not held out) are **observed**, not hidden. Each counts as survive if
its consensus is ≤ θ.

---

## 4. Tauchstone engine (WS5)

**Claim** C_d: (1/|S_d|) Σ_{c∈S_d} 1(y_c = survive) ≥ q, with q = 0.7 (prereg) and K* = ⌈q·|S_d|⌉
survivals needed.

**Similarity** w(x, c) ∈ [0, 1] between a hidden context x and an observed or revealed context c
(prereg):

- Same type: start at 0.4. Then add for LINCS pairs: same cell_id +0.3, same dose +0.15, same
  time +0.15. Add for cohort, adjusted or cell-type pairs: same platform +0.3, same region +0.3.
  Cap at 1.
- Different type: 0.1.

**P(survive | x, D)**: a similarity-weighted Beta posterior.

- Prior per type: Beta(κ·m_t, κ·(1 − m_t)) with κ = 2. m_t is the survive rate of type t among
  development candidates (prereg). Use m_t = 0.5 if a type has no development data.
- α_x = κ·m_t + Σ_c w(x,c)·y_c and β_x = κ·(1 − m_t) + Σ_c w(x,c)·(1 − y_c), summed over everything
  observed (ranking contexts) and revealed so far.
- The ranking contexts' total weight is capped at 4 per hidden x: if their Σw exceeds 4, scale those
  weights by 4/Σw. Without this, dozens of ranking contexts swamp the prior. Revealed contexts are
  never scaled.
- p_x = α_x / (α_x + β_x).

**Uncertainty bands.** Recompute everything on 200 bootstrap resamples of d's ranking-context
signatures (seed 20261105), then report the 5th–95th percentile of P(C | D) as `Belief.interval`.

**P(C | D)**, exact: revealed survivals r plus K_hidden ~ Poisson-binomial(p_x over the hidden x),
computed by dynamic programming. P(C | D) = P(K_hidden ≥ K* − r). It is deterministic.

**Verdict** (thresholds prereg): SUPPORTED_SO_FAR if P(C|D) ≥ 0.8; FRAGILE_CONTEXT_DEPENDENT if
≤ 0.2; otherwise INSUFFICIENT_EVIDENCE.

**Acquisition**, over hidden x:

- attack (`max_failure`): a(x) = 1 − p_x
- learn (`expected_decision_change`): a(x) = Σ_{y∈{0,1}} P(y | x, D) · |P(C | D ∪ (x,y)) − P(C | D)|.
  Each hypothetical y updates every other hidden context's posterior via w before P(C) is recomputed.
- tauchstone hybrid: a(x) = learn(x) + λ·(1 − p_x), with λ (prereg) fixed on development
  candidates only, chosen from the grid {0, 0.1, 0.25, 0.5, 1} by decision accuracy, then by median
  experiments to correct verdict.
- `max_uncertainty`: a(x) = p_x(1 − p_x)
- `greedy_strongest`: a(x) = p_x, i.e. pick the most supportive test (the confirmation-bias baseline)
- `random`: uniform

Ties break by lower context_id, except under `random`, which uses the seed. The UI toggle maps
attack → max_failure and learn → expected_decision_change. The `rationale` string names the
quantity being maximised and its value.

---

## 5. Replay benchmark (WS5, Tier 3)

Runs only after the preregistration hash is committed; the code must refuse otherwise.

- Pool: top 50 candidates × 20 seeds × 6 policies, budget 5 (prereg).
- Every run also records step 0, the belief before any reveal. A verdict that is already decisive at
  step 0 gives experiments to correct verdict = 0 for every policy.
- **Primary analysis = contested candidates**: those whose step-0 verdict is INSUFFICIENT_EVIDENCE.
  Policy choice can only matter there. The all-candidates analysis is reported alongside it, and the
  contested share is reported.
- **Harness check (synthetic only, not reported as a competitor)**: an `oracle` policy that picks the
  hidden context whose true outcome moves P(C) furthest toward the full-information verdict. In a
  synthetic world built with exploitable structure, the hybrid policy must beat random and the oracle
  must beat everything. If not, the harness or a policy is wrong.
- Full-information verdict = SUPPORTED if the claim holds using every y in S_d, else FRAGILE.
- **Experiments to correct verdict**: the first t ≤ 5 at which the verdict is not INSUFFICIENT and
  equals the full-information verdict; budget + 1 if that never happens (censored, and reported).
- **Fragile recall at b ∈ {3, 5}**: among FRAGILE-truth candidates, the fraction whose verdict at b is
  FRAGILE.
- **Decision accuracy**: verdict at b = 5 equals the full-information verdict (INSUFFICIENT counts as
  wrong).
- **Brier and reliability**: p_x at the moment x is revealed vs y_x, over all reveals; 10 equal-width bins.
- **CIs**: cluster bootstrap over candidates (resample candidates with their 20 seeds), 2,000 reps,
  seed 20261105; percentile 95% CI.
- **Tests**: per candidate, average the metric over seeds. Paired Wilcoxon signed-rank of
  tauchstone_hybrid vs each other policy, with Holm correction across the five comparisons.
