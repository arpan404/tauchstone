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
11. No-data brain exposure = fail (spec: "no measured data = fail"); its
    `value`/`threshold` are null (measures are heterogeneous; see evidence card).
12. Cohort/adjusted truth rows carry `threshold: null` — the 5% rule is
    rank-based, so no scalar threshold exists. Theta is read from the primary
    permutation summary's provenance sidecar (`parameters.theta*`), falling
    back to a `theta` column.

## Synthetic world

`make_synthetic_world(n, seed)`: latent robustness `rho ~ Beta(2,2)` per
candidate; context survive probability = mean of `rho` and a type base rate,
so same-candidate contexts are correlated and similarity weighting matters.
`dry_run_synthetic` splits 100 candidates into benchmark pool (first 50) and
development pool (ranks 51–100 analog), selects lambda on dev, and writes to
`processed/tauchstone/synthetic/` only, labelled synthetic.
