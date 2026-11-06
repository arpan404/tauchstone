# pipelines/tauchstone

WS5 Tauchstone engine: truth table (server-only), similarity-weighted Beta posterior,
Attack/Learn policies, replay benchmark, calibration. Output:
`processed/tauchstone/*.parquet`. Read /AGENTS.md first.

## Public API (frozen; the FastAPI agent codes against these names)

- `pipelines/tauchstone/engine.py` — `Context`, `Observation`, `EngineConfig`,
  `similarity`, `p_survive`, `p_claim`, `verdict`, `POLICIES`, `MODE_TO_POLICY`,
  `acquisition`, `choose`, `belief_interval`, `bootstrap_belief_interval`.
- `pipelines/tauchstone/session.py` — `AttackSession` (no web code; `state()` is
  JSON-serialisable and never exposes unrevealed outcomes).
- `pipelines/tauchstone/truth_table.py` — `build_truth_table`, `write_truth_table`,
  `make_synthetic_world`, `synthetic_truth_table`, `prereg_guard`, `load_theta`.
- `pipelines/tauchstone/replay.py` — `run_replay`, `replay_candidate`,
  `dry_run_synthetic`, `main` (`--dry-run-synthetic`).
- `pipelines/tauchstone/evaluation.py` — `summarize`, `per_run_frame`,
  `full_information_verdict`, `select_lambda`.

## Ambiguities resolved (spec-silent choices)

1. `EngineConfig.type_priors` default: `{held_out_cohort, composition_adjusted,
   lincs_context, brain_exposure, cell_type: 0.5}` (covers every prereg context
   type); `p_survive` falls back to 0.5 for any type absent from the mapping.
2. Similarity for `brain_exposure` same-type pairs: base 0.4 only (the spec
   defines bonuses only for LINCS pairs and cohort/adjusted/cell-type pairs).
   `None` metadata never earns a bonus.
3. `cell_type` counts as cohort-like for the platform/region bonuses.
4. `belief_interval(samples, lower=5, upper=95)` is the generic percentile
   helper; `bootstrap_belief_interval(...)` resamples **ranking observations**
   (the library never sees raw signatures — the true signature-level bootstrap
   runs upstream with the same seed 20261105; documented in the docstring).
5. Learn acquisition recomputes posteriors over the *remaining* hidden contexts
   after each hypothetical reveal, with `n_total` fixed (revealed count `r`
   rises, so `P(C)` is over the smaller hidden set plus the larger `r`).
6. `choose` tie-break: lower `context_id`, except `random` whose uniform draws
   come from the passed `rng` (ties have probability ~0).
7. Rationale strings name the maximised quantity, e.g. max_failure:
   "Most likely to break the claim: 62% chance this test fails."
8. Benchmark paired tests use per-candidate seed-means of
   `experiments_to_correct_verdict` (the spec's "the metric"), Holm-corrected
   over the five hybrid-vs-other comparisons.
9. Cluster-bootstrap reps that draw zero fragile candidates (possible only in
   tiny test worlds) are skipped for the fragile-recall CI.
10. `select_lambda` uses 5 dev seeds `[20261105..20261109]` (spec fixes 20 seeds
    for the benchmark pool only); ties break toward the smaller lambda.
11. No *measured* exposure rows for a candidate = the `brain_exposure` context is
    absent from S_d (untestable, not a failure); fail only when measured values
    sit below the thresholds. Its `value`/`threshold` are null (measures are
    heterogeneous; see evidence card).
12. Cohort/adjusted truth rows carry `threshold: null` — the 5% rule is
    rank-based, so no scalar threshold exists. Theta is read from the primary
    permutation summary's provenance sidecar (`parameters.theta*`), falling
    back to a `theta` column.
13. Step-0 rows carry `context_id: null`, `p_survive_before: NaN`,
    `outcome: null`; Brier and calibration use step >= 1 only. `t_correct = 0`
    when the step-0 verdict is decisive and matches the full-information
    verdict.
14. The oracle (`replay.ORACLE_POLICY`) picks the hidden context whose true
    outcome moves P(C) furthest toward the full-information verdict (ties:
    lower `context_id`). Synthetic dry-runs only; `summarize` filters rows to
    `engine.POLICIES`, so the oracle can never leak into a real summary.
15. `summarize` returns `{"contested", "all", "contested_share"}`; both blocks
    have Benchmark-schema shape `{n_candidates, n_seeds, budget, policies,
    calibration, tests}`. `build_summary` puts the contested (primary)
    analysis at the top level and the same-shape all-candidates block under
    `all_candidates` (+ `contested_share` in both places).
16. Cross-type pairs (e.g. held-out cohort vs composition-adjusted) stay 0.1
    even with identical platform/region; the "decisive structure" a smart
    policy exploits is same-cell LINCS blocks (>= 0.7 mutual similarity).
17. `decision_lookahead_hybrid` (co-primary) ties fall back to the learn score
    then lower id, like the experimental lookahead; without a known
    `budget_remaining` its lookahead depth defaults to 2. `lam_L` lives in
    `EngineConfig.lam_lookahead`, selected on development candidates like lam.
18. Benchmark tests: 10 Holm-corrected comparisons (each co-primary vs the 5
    baselines) plus one co-primary head-to-head entry whose metric name is
    suffixed `_descriptive` and whose `p_holm` holds the UNCORRECTED p-value —
    schema-valid, labelled descriptive, reported as descriptive only.
19. Theta default comes from prereg `ranking.permutation_control_run`
    (gold run since 0f4c619); `--permctl` overrides. Unrankable candidates
    (absent or < 3 ranking contexts in a cohort/adjusted query) fail with
    "not rankable" appended to the rule string (the row schema has no detail
    column).

## Experiment: decision lookahead (candidate policies, not prereg)

Lead review of the synthetic dry run: learn/hybrid reach a verdict fastest
(median t_correct 2 vs 3) with the best fragile recall@3 (0.60), but final
decision accuracy at budget 5 is BELOW random (0.53 vs 0.57) and recall drops
from 0.60 at b=3 to 0.47 at b=5. Diagnosis: E|ΔP(C)| rewards volatile tests,
not tests that lead to a CORRECT DECISIVE verdict.

`engine.CANDIDATE_POLICIES = ("decision_lookahead", "decision_lookahead_hybrid")`
— kept out of `POLICIES`, replay defaults, and every real summary:
- `decision_utility(p)`: p if p ≥ 0.8, 1−p if p ≤ 0.2, else 0 (probability the
  verdict we would announce now is correct; 0 when INSUFFICIENT).
- `decision_lookahead_scores(...)`: depth d = min(2, budget_remaining).
  d=1: a(x) = E_y[U(after)]; d=2: a(x) = E_y[max(U(after), V1(after-state))],
  where V1 is the best d=1 value from the after-state (stop-early max). Every
  hypothetical updates all other hidden posteriors via similarity, exactly as
  in learn. P(C) evaluations are cached by revealed-set key. `_hybrid` adds
  lam·(1−p_x). All-zero scores fall back to the learn score, then lower id.
- Honesty protocol (`pipelines/tauchstone/experiment_lookahead.py`): lam
  selection (dev half) and all comparisons on 5 fresh synthetic worlds
  (seeds 9001–9005, never the dry-run world), 100 candidates each, eval on the
  contested subset at budget 5 (metrics also at b=3), cluster-bootstrap CIs
  pooled over worlds plus paired Wilcoxon (per-candidate seed-means) of
  lookahead(_hybrid) vs hybrid and vs random. Outputs to
  `processed/tauchstone/synthetic/lookahead_experiment/`, labelled synthetic.

## Synthetic world

`make_synthetic_world(n, seed)`: latent robustness `rho ~ Beta(2.0, 1.6)` plus a
per-candidate per-cell-line latent effect `Uniform(0, 1)`; a LINCS context's
survive probability = 0.5·rho + 0.3·(type base rate) + 0.2·(cell effect),
clipped to [0.05, 0.95]; cohort/adjusted/exposure mix rho with their base rate
only. Hidden LINCS contexts sit in two 3-context same-cell blocks plus one
singleton; the 5 ranking observations land in the same cells, so similarity
weighting can exploit the blocks. Brain exposure is included with probability
0.6 (mirroring "no measured data → not in S_d"). Calibrated on seed 20261105
(n=100): claim-holds rate 0.42, contested share 0.63 — asserted by
`test_synthetic_world_calibration_claim_rate_and_contested_share`.
`dry_run_synthetic` splits 100 candidates into benchmark pool (first 50) and
development pool (ranks 51–100 analog), selects lambda on dev, replays the
pool with the six policies plus the oracle, and writes to
`processed/tauchstone/synthetic/` only, labelled synthetic.
