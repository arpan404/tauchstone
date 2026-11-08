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

## MVP additions (Nov 7, 2026)

None of these change the sealed set, the truth table, θ or the benchmark.

- **Live screens** (`pipelines/lincs/screen_job.py`) run the frozen scoring code on LINCS gold
  rows. Re-screening GSE132903 reproduces the frozen ranking (max difference 1e-15). Any other
  signature, including uploads and the built-in GSE173955 project, is labelled
  *not preregistered*.
- **Ad-hoc tests** (`pipelines/tauchstone/adhoc.py`) build hidden tests for drugs outside the
  sealed set. They never write the truth table, refuse sealed drugs, and are labelled
  *not preregistered*. They read held-out compound rankings only when a committed experiment runs.
- **Resource agreement** (Perturb-Seqr ranks; CLUE needs a key) is report-only. It feeds no
  ranking, threshold or candidate choice.
- **Evidence gaps** (cancer lines only, single concentration, acute time point, brain exposure
  label) describe the LINCS ranking contexts and are display-only.
- **AI estimate on My compounds** (Nov 8). The exploratory structure model
  (`pipelines/lincs/exploratory_model.py`: random forest on 1,024-bit Morgan fingerprints,
  radius 2, predicting the GSE132903 discovery `consensus_median`) is now shown in the UI as an
  "AI estimate" column, served by `POST /compounds/estimate`, plus a closed-by-default "About
  this estimate" panel reading `GET /lab/model`. It is display only and labelled not
  preregistered: it changes no ranking, threshold, truth table, hidden test or verdict, and it
  is a guess at what LINCS would measure, not evidence about Alzheimer's. Honest test numbers
  (scaffold-grouped internal test, n = 1,123): mean absolute error 0.472 versus 0.481 for always
  predicting the training mean, R2 0.023, Spearman 0.18, so barely better than guessing the
  average. The stored predictions cover only the 5,633 compounds that already have a measured
  score, and 4,510 of those were in training, where the number flatters the model; those rows
  are tagged "in training data". Compounds outside that table get a fresh estimate from SMILES;
  if their fingerprint is identical to a training structure they are also tagged "in training
  data". Artifacts are checked against their provenance checksums before the model is loaded.
- **More training labels for the structure model** (Nov 8). Exploratory, not preregistered. We
  retrained the same random forest (same fingerprints, settings, seed 20261105 and scaffold split
  procedure) on labels from the all-signature GSE132903 ranking that the permutation control had
  already produced (`GSE132903__permctl__compound_ranking.parquet`, 16,482 compounds, ranking
  contexts only, nothing recomputed), instead of the gold-only ranking (5,690 compounds). Code:
  `train_model(labels='all')` and `pipelines/lincs/exploratory_compare.py`; artifacts in
  `processed/models/exploratory_candidates/`. Each run's own test numbers use its own labels and
  test compounds, so they are not like for like. The other rows score both models on the same
  held-out compounds against the gold labels the app shows:

| test set | model | trained on | MAE (mean-only MAE) | R2 | Spearman |
|---|---|---|---|---|---|
| each run's own (not like for like) | gold labels | 4,510 | 0.472 (0.481), n = 1,123 | 0.023 | 0.18 |
| each run's own (not like for like) | all labels | 12,805 | 0.404 (0.408), n = 3,602, all labels | 0.030 | 0.19 |
| held out by both, n = 212 | gold labels | 4,510 | 0.494 (0.487) | −0.049 | 0.19 |
| held out by both, n = 212 | all labels | 12,805 | 0.472 (0.486) | 0.027 | 0.28 |
| gold test set, n = 1,123 | gold labels | 4,510 | 0.472 (0.481) | 0.023 | 0.18 |
| gold test set, n = 1,123 | all labels, refit without any gold-test scaffold | 14,332 | 0.479 (0.480) | 0.021 | 0.15 |

All-minus-gold differences with 95% intervals from 2,000 scaffold-group bootstraps: on the 212
shared compounds MAE −0.023 (−0.047 to +0.001), Spearman +0.09 (−0.06 to +0.21); on the 1,123
gold test compounds MAE +0.007 (−0.001 to +0.016), Spearman −0.03 (−0.09 to +0.03). The small
set leans towards more labels, the five-times-larger set leans the other way, and every interval
includes zero. About three times more labels did not make the model better on unseen structures, so
the app keeps serving the gold-label model unchanged (same run, same artifacts, same numbers).
No preregistered artifact changed: `preregistration.yaml` is still `21f7460e…bb8a3` and the
frozen GSE132903 ranking is still sha256 `34c1a646…afe4`.

- **Structure model bake-off: a neural network against the random forest** (Nov 8). Exploratory,
  not preregistered. Run under the replacement rule frozen in
  `data/manifests/preregistration_v2.yaml` (sha256 `26aec26d...70f17b0`, section `structure_model`),
  which was written before any of these models existed. Code:
  `pipelines/lincs/structure_bakeoff.py`, scored with the existing
  `pipelines/lincs/exploratory_compare.py` metrics and bootstrap; artifacts in
  `processed/models/v2_candidates/`. Every model uses the served model's inputs (gold-signature
  GSE132903 ranking labels, `compounds.parquet`), its scaffold split (GroupShuffleSplit, test_size
  0.2, seed 20261105) and the same 1,123 held-out compounds in 687 scaffold groups. Early stopping
  and hyperparameter choice used an inner split of the TRAINING groups only (GroupShuffleSplit,
  test_size 0.15, seed 20261106: 3,826 fit, 684 validation); the test compounds were never used to
  choose anything. Seeds: split 20261105, inner 20261106, network weights and batch order 20261107,
  bootstrap 20261108. PyTorch 2.15.0 on the Apple MPS device; torch is an opt-in `ml` dependency
  group, so the expo API image still installs without it.

  What was trained:
  - **Neural network**: 1024 -> 512 -> 256 -> 1 MLP, ReLU, dropout 0.3, Adam (lr 1e-3, weight decay
    1e-4), batch 256, early stopping on inner validation loss (patience 20; stopped at epoch 22,
    best epoch 2). Same fingerprints and labels as the served model. 1.7 s to train.
  - **Neural network, one output per cell line**: the same network with 82 outputs, trained on the
    per compound and cell line median of ranking-context scores from
    `GSE132903__main__context_scores.parquet` (ranking rows only; held-out rows never read, asserted
    in code), missing cells masked out of the loss. Its consensus is the median over each compound's
    own ranking contexts of the predicted score for that context's cell line, the same aggregation
    the pipeline uses for `consensus_median`. 0.7 s to train.
  - **Random forest with chemistry descriptors**: the served model's class on the same fingerprints
    plus ten RDKit descriptors (MolWt, LogP, TPSA, rotatable bonds, HBD, HBA, ring count, aromatic
    rings, fraction sp3 carbon, heavy atoms). `min_samples_leaf` and `max_features` chosen by
    highest inner-validation Spearman over a 4 x 3 grid, then refit on all training groups; chosen
    `min_samples_leaf` 10, `max_features` 1.0 (inner validation Spearman 0.269). 28 s to train.

  On the shared held-out compounds (n = 1,123), against always predicting the training mean
  (MAE 0.4815):

| model | MAE | R2 | Spearman | Spearman minus served (95%) | MAE minus served (95%) |
|---|---|---|---|---|---|
| random forest (served) | 0.4720 | 0.023 | 0.180 | - | - |
| neural network | 0.4671 | 0.029 | 0.175 | -0.005 (-0.069 to +0.062) | -0.005 (-0.017 to +0.005) |
| neural network, one output per cell line | 0.4627 | 0.057 | 0.239 | +0.060 (-0.008 to +0.129) | -0.009 (-0.021 to +0.001) |
| random forest with descriptors | 0.4675 | 0.056 | 0.223 | +0.044 (-0.012 to +0.100) | -0.004 (-0.012 to +0.003) |

  Intervals are 2,000 bootstrap resamples of the 687 scaffold groups, seed 20261108, paired on the
  same compounds. The rule applied mechanically: the plain neural network ranked unseen structures
  no better than the random forest; the multi-task network and the descriptor forest both ranked
  them better on the point estimate, but their intervals include zero, so neither passes. **Nothing
  served changed**: the app still serves the same random forest run `85eff9eb`, same artifacts, same
  numbers. The three candidates are stored unserved in `processed/models/v2_candidates/` with
  provenance for each file. The comparison is shown in the app in the closed-by-default "About this
  estimate" disclosure on My compounds, read from the stored file by
  `GET /compounds/estimate/models`; nothing is computed at request time.

  Worth saying plainly: the two models that look better are the two that use more information (per
  cell line labels, physicochemical descriptors), and both point the same way. The honest reading is
  that this test set cannot tell them apart from the random forest, not that they are equal. A
  larger held-out set would settle it; that is for after the expo. No preregistered artifact
  changed: `preregistration.yaml` is still `21f7460e...bb8a3`, `preregistration_v2.yaml` is still
  `26aec26d...70f17b0`, and the frozen GSE132903 ranking is still sha256 `34c1a646...afe4`.

## Amendments after the freeze

The preregistration (`data/manifests/preregistration.yaml`, sha256 `21f7460e…bb8a3`) was frozen on
Nov 5 and has not been edited since. Everything below was added afterwards. None of it changes
the frozen ranking, θ, λ, the truth table, the benchmark or any verdict, and each item is labelled
**Exploratory** in the app (the label read "not preregistered" until Nov 8).

| Date | Added | Touches a preregistered result? | How it is labelled |
|---|---|---|---|
| Nov 6 | Live screens of other signatures and uploads | No: re-screening GSE132903 reproduces the frozen ranking | Exploratory, per project |
| Nov 6 | Hidden tests built on the fly for drugs outside the sealed set | No: refuses sealed drugs, never writes the truth table | Exploratory on Attack |
| Nov 7 | Resource agreement (Perturb-Seqr, CLUE) | No: report only | Report only |
| Nov 7 | Evidence gaps (cell lines, concentration, time, brain exposure label) | No: display only | Shown on the Drug page |
| Nov 7 | GSE173955 hippocampus as a separate project | No: its ranking is never used for hidden tests | Exploratory |
| Nov 8 | Single-cell reversal by cell type | No | Exploratory |
| Nov 8 | My compounds search over all LINCS compounds | No: same lookup, more names | Exploratory |
| Nov 8 | AI estimate from structure | No: never used for ranking or tests | Exploratory, with test numbers |
| Nov 8 | Structure model trained on all-signature labels | No: did not beat the served model, so not used | Logged above |
| Nov 8 | Neural network and descriptor forest tried against the structure model | No: none passed the frozen v2 replacement rule, so the served model is unchanged | Logged above |
| Nov 8 | LINCS 2020 beta downloaded (compound signatures) | No: opt-in, separate folder, not read by any v1 code | Not shown in the app |
| Nov 8 | Live cell-line panel on Screen | No: counts from the frozen scoring, held-out scores never sent | Shown during a screen |
| Nov 8 | Boundary sentence moved from every page to the PDF report | No | AGENTS.md rule 7 updated |

### Preregistration v2 (Nov 8)

`data/manifests/preregistration_v2.yaml`, sha256 `26aec26ded3eae4a940fcb3e9aa592dd6d8b3a4b98ffd42f64db27d3870f17b0`,
frozen on Nov 8 with Arpan's sign-off, before any v2 analysis was run. It fixes in advance three
analyses for after the expo: whether the ranking replicates on LINCS 2020 measurements that are
new since the v1 releases, extra held-out patient cohorts (AMP-AD, SEA-AD) once access is granted,
and the rule for replacing the AI estimate's model. It inherits every v1 setting it names
unchanged and cannot alter a v1 result. The file lists exactly what had been looked at in v2 data
when it was written: LINCS 2020 file sizes, columns and row counts only, no expression values.
