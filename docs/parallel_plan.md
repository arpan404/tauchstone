# Tauchstone: Second Life — plan for the remaining work (parallel agents)

Expo: **Mon Nov 9**. Code freeze: **Sun Nov 8, 8 pm**. This file is the brief for every remaining agent.

## What we are making

A website a judge drives in 3 minutes.

1. **Second Life (find):** a real Alzheimer's brain signature (195 human brains, GSE132903). Every LINCS
   drug is scored for how strongly it pushes that signature the other way. The result is a ranked list
   of 1,816 drugs that have been tested in humans, each with an evidence card: targets, brain
   expression, AD association, approval status, brain exposure and a 3D target structure.
2. **Tauchstone (attack):** for a chosen drug, the system picks the hidden test most likely to break
   the claim, reveals it, and shows confidence moving. The hidden tests are a held-out cohort, a
   cell-loss-corrected signature, unseen LINCS cell lines and doses, and measured brain exposure.
3. **Proof:** a preregistered benchmark on 50 sealed drugs. Tauchstone reaches the right keep-or-drop
   decision in fewer experiments than random (Holm p = 0.0009) and is right 100% of the time within
   5 tests, against 88% for random.

Pitch: *"Anyone can rank drugs. We built the system that tries hardest to prove its own results wrong
before anyone pays to test them."*

## Where things stand (all on `main`)

| Done | Notes |
|---|---|
| Data, signatures, ranking, candidate pool | `pipelines/geo`, `pipelines/lincs`, `pipelines/evidence` |
| Tauchstone engine, truth table, benchmark | `pipelines/tauchstone`; preregistration frozen (`data/manifests/preregistration.yaml`) |
| API on real data | `services/api`; `TS_API_MOCK=0` |
| Web app, 5 views, works on real data | `apps/web`; plain styling for now |
| Offline Docker bundle | `make demo`, `make up`, `scripts/offline_check.sh`, `docs/offline.md` |
| QA / red team, integrity log | `docs/qa_report.md`, `docs/integrity_log.md`, 169 tests |

**Frozen, do not change:** the preregistration, the truth table, the benchmark results, and the
science rules in `contracts/algorithms.md`. The remaining work is presentation, polish and checks.
A science change now invalidates the benchmark.

## Rules for every agent

- Read `AGENTS.md` first. Its rules on leakage, sign convention, wording and the boundary banner apply.
- Work on your own branch from `main`: `git switch -c <track-id>/<short-name> origin/main`.
- Stay inside your track's folders (table below). If you need a change elsewhere, write it in your
  final report instead.
- Before you report done, all of these must pass: `make test`; `cd apps/web && bun run build && bun run
  typecheck && bun run lint && bun run test && bun run check:api`; and, after UI changes,
  `TS_API_PORT=18000 TS_WEB_PORT=18080 bash scripts/offline_check.sh`.
- Real data lives in `~/Data/tauchstone` (or `$TS_DATA_DIR`) on Arpan's Mac. On another machine,
  copy `data/demo/processed` (built by `make demo`) and point `TS_DATA_DIR` at it.
  - Run the app: `TS_API_MOCK=0 make api` and `cd apps/web && VITE_USE_MOCK=0 bun run dev`.
- Open a PR to `main`. Its description lists what changed, screenshots for UI work, and anything you
  could not verify. One person merges (Arpan or the lead agent).
- No clinical language. Brain exposure is always labelled measured or predicted. A structure is
  target context, not binding evidence.

## Tracks

They can run in parallel. The arrows mark the only dependencies.

| ID | Track | Owns (folders) | Depends on | Size |
|---|---|---|---|---|
| T1 | Lab-instrument restyle of the whole app | `apps/web/src/components`, `apps/web/src/features/{disease-signature,repurposing,evidence,protein-viewer,tauchstone,benchmark}`, `apps/web/src/index.css`, `apps/web/src/App.tsx` | — | 1 day |
| T2 | 3D expo scene (Three.js) | `apps/web/src/features/expo-scene/` (new), `apps/web/package.json` (three only) | T1 merges first for `App.tsx`; one lazy route line | 1 day |
| T3 | Deck figures from real results | `pipelines/reporting/` (new), `docs/figures/` | — | half a day |
| T4 | Deck, pitch script, Q&A | `docs/deck/` (new) | T3 figures (can start now with placeholders) | 1 day |
| T5 | Science loose ends | `pipelines/evidence/`, `pipelines/lincs/clue.py` (new), `tests/redteam/`, `docs/qa_report.md` | CLUE key from Arpan for part C | half a day |
| T6 | Judge-facing README and repo polish | `README.md`, `docs/` (except `deck/`, `figures/`) | screenshots after T1 | half a day |
| T7 | Automated fallback recording and release | `tests/e2e/` (new), `scripts/`, `Makefile` (release targets), `compose.yaml` | T1 and T2 merged (prepare now) | half a day |
| T8 | Optional: single-cell exploratory view | `pipelines/singlecell/` (new), `apps/web/src/features/single-cell/` (new) | only if T1–T7 are on track; never enters the benchmark | 1 day |

Timeline:
- **Fri:** T1, T2, T3, T5 and T6 start. T4 starts the outline.
- **Sat noon:** T1 and T2 merged. T4 drops in the T3 figures.
- **Sat evening:** UI freeze. T7 records the fallback video and builds the release bundle.
- **Sun:** human rehearsal with Wi-Fi off on both laptops. Code freeze at 8 pm.

## Human tasks (Arpan / Rijan)

1. Register the CLUE academic account and put the key in `.env` as `TS_CLUE_API_KEY=...` (unblocks T5 part C).
2. Science look-over: the signature (volcano, sign check), the top 20, and the claim wording. 30 min, Sat morning.
3. Pick the design direction; the default is lab instrument plus an optional 3D expo scene.
4. Sun: rehearse the 3-minute and 90-second versions with Wi-Fi off on both laptops (`docs/offline.md`).
5. Make sure both laptops can answer the five Q&A questions (T4 writes the answers).

---

## Agent briefs (paste one into each agent)

### T1 — Lab-instrument restyle

> You are restyling the web app of Tauchstone: Second Life (expo Mon Nov 9). Read `AGENTS.md` and
> `docs/parallel_plan.md` (rules, your folders). The app is React 19, Vite 8, Tailwind v4, shadcn/ui,
> ECharts and Mol* in `apps/web`, and it already works on real data. Goal: it should look like a
> credible **lab instrument** on an expo monitor seen from 3 m: a dark graphite surface, a fine grid
> texture, monospace readouts for numbers, teal for reversal and attention, amber for warnings, red
> only for failures, and green only for survives.
> - Apply it as design tokens in `index.css`, then use them in every view: Signature, Candidates,
>   Evidence, Attack, Benchmark.
> - Attack view: P(claim) as a large instrument readout with a live trace across reveals. Hidden tests
>   are "sample wells" that stay sealed until run, pulse when recommended, and turn red or green on
>   reveal. One big Run validation button.
> - Benchmark view: lead with decision accuracy after 5 tests and the Holm-corrected p-values against
>   random and greedy (from `/benchmark`, the `tests` field). The median-experiments chart is a tie,
>   so move it below.
> - Keep the boundary banner text exactly as it is. Keep every existing data binding and test. Keep
>   keyboard navigation (1–5) and the visible focus rings.
> - Check at 1280×800 and 1920×1080 against the real API (`TS_API_MOCK=0`). Respect
>   prefers-reduced-motion.
>
> The reference mockup is the "A. Lab instrument" direction Arpan approved (dark panel, wells, trace).
> Done = all checks in the plan pass, plus screenshots of all 5 views in the PR.

### T2 — 3D expo scene

> Build an optional full-screen **expo mode** for Tauchstone: Second Life in
> `apps/web/src/features/expo-scene/` with Three.js (add `three` and `@types/three` only). Read
> `AGENTS.md` and `docs/parallel_plan.md`. Lazy-load it, so it is not in the main bundle. Add one
> entry point: a key (`E`) or button that opens it over the current view. That needs a single line in
> `App.tsx`; coordinate with T1 by rebasing after T1 merges.
> - **Scene:** the AD signature as a slowly rotating sphere of genes. Use the real `/signatures/GSE132903`
>   data: position by gene index, colour by sign of `stat` (up warm, down teal), size by |stat|, and the
>   300 query-set genes brighter. The selected drug sits at the centre with a ring showing P(claim).
>   Its hidden tests orbit as labelled nodes (`contexts` from the attack session).
> - **Run validation** in this mode calls the same API. A beam travels to the recommended node, the
>   node turns red or green, and the ring animates to the new P(claim).
> - It must hold 60 fps on an M-series MacBook with 16k points: use one `Points` geometry and no
>   per-gene meshes. Degrade if WebGL is missing: show a message and stay on the normal view. Respect
>   prefers-reduced-motion (no rotation). Clean up the WebGL context on close. It must work offline.
>
> Done = it opens, runs a full attack on Piperacillin (pool rank 5), keeps 60 fps, all checks pass,
> and the PR includes a short screen recording.

### T3 — Deck figures

> Create `pipelines/reporting/figures.py` for Tauchstone: Second Life. It writes PNG and SVG figures to
> `docs/figures/` from the real outputs in `$TS_DATA_DIR/processed`, which you must not modify. Read
> `AGENTS.md`, `docs/integrity_log.md` and `docs/parallel_plan.md`. Use matplotlib: a dark lab style
> for slides and a light style for print (both). Every number is computed from files, never typed in.
> Figures:
> 1. Volcano of GSE132903 with the 7 sign-check genes labelled.
> 2. Decision accuracy after 5 tests by policy (from `tauchstone/benchmark_summary.json`), with 95%
>    CIs, Tauchstone highlighted, and Holm p-values against random and greedy annotated.
> 3. Experiments to the correct verdict: the distribution per policy (from
>    `tauchstone/benchmark_runs.parquet`, primary contested set).
> 4. The permutation control: reuse `pipelines.lincs.permutation_report.rank_matched_curve`.
> 5. A candidate funnel: 21,299 LINCS compounds, 5,690 rankable on gold signatures, 1,816
>    clinical-stage, top 50 sealed benchmark, 3 demo picks.
> 6. Calibration of P(survive), from the benchmark summary bins.
> 7. A one-attack storyboard for Piperacillin: start the real engine through `pipelines.tauchstone`
>    and plot P(claim) per step.
>
> Add `make figures`. Done = all figures regenerate from one command, plus a pytest that each figure
> file is produced.

### T4 — Deck, pitch script, Q&A

> Build the pitch for Tauchstone: Second Life (expo Mon Nov 9, a 3-minute judge-driven demo). Read
> `AGENTS.md`, `docs/integrity_log.md`, `docs/qa_report.md`, `docs/parallel_plan.md` and the build
> plan's demo script in `docs/plan_demo_script.md` if present (otherwise follow the 0:00–3:00 script
> below). Produce `docs/deck/`:
> - (a) `deck.md` with 10–12 slides: title, problem, what we built, signature, ranking, the attack (with
>   storyboard), the benchmark result, integrity (preregistration hash, the log, the honest
>   limitations), business slide, close with the boundary sentence.
> - (b) `build_deck.py`, which renders it to `deck.pptx` with python-pptx (add it as a dev dependency),
>   using the figures from `docs/figures/` (T3 produces them; use placeholders until they exist).
> - (c) `script.md`: the 3-minute and 90-second spoken scripts, timed.
> - (d) `qa.md`: answers to the five likely judge questions, plus these, all from the logs: "Hasn't
>   CMap for AD been done?", "LINCS uses cancer lines", "Could it be neuron loss?", "Did you tune on
>   the test?", "Why trust P(survive)?", "Why did the permutation gate fail?", "Why did the
>   decision-aware policy not beat random?"
>
> Every number must trace to a file. Never claim the drugs treat AD. The business slide has no cost
> figure unless it is sourced. The 3-minute script order:
> - 0:00 volcano;
> - 0:20 ranking;
> - 0:50 evidence card plus Mol*;
> - 1:15 attack, toggling Attack/Learn and running validation twice;
> - 2:15 benchmark;
> - 2:40 boundary and close: "Find a drug. Attack the hypothesis. Keep only what survives."

### T5 — Science loose ends

> Finish three checks for Tauchstone: Second Life without changing any frozen output (the truth
> table, benchmark and preregistration). Read `AGENTS.md`, `docs/qa_report.md` and
> `docs/parallel_plan.md`.
> - **(A) Exposure rows.** Two flagged rows are locked as xfail in `tests/redteam/test_exposure_bounds.py`:
>   a preclinical CSF ratio above 1 and a CSF value in % units. Look up the ChEMBL assays, decide
>   whether each is a real value or a parsing error, and document it in `docs/qa_report.md`. If a parse
>   is wrong, fix `pipelines/evidence/exposure.py` and report which truth-table rows it would change.
>   Do not rebuild the truth table or rerun the benchmark; the lead decides.
> - **(B) Mol\* check.** For the targets of the top 10 pool drugs, confirm each `structures.parquet`
>   entry has a local `.cif` that parses (gemmi or Biopython, or a minimal mmCIF header check) and that
>   `GET /structures/{id}.cif` serves it. Write the list to the report.
> - **(C) CLUE cross-check**, once `TS_CLUE_API_KEY` is set. Add `pipelines/lincs/clue.py`: query CLUE
>   with our top 150 up and 150 down genes (Entrez, from `pipelines.lincs.scoring.build_query_sets`),
>   then report the Spearman correlation between CLUE tau and our consensus for the top 50 overlapping
>   compounds. Cache the response locally. Report only; no tuning.

### T6 — Judge-facing README

> Rewrite `README.md` for judges and new contributors of Tauchstone: Second Life:
> - what it does in 5 lines
> - a screenshot of each view (from the running app, after T1 merges)
> - the headline result with links to `docs/integrity_log.md` and the frozen preregistration (with its
>   hash)
> - how to run it offline (`docs/offline.md`) and how to reproduce from scratch (`make setup data
>   signatures rank evidence truth-table benchmark`, with rough times)
> - an architecture diagram (Mermaid)
> - data sources with licences: GEO, LINCS, Open Targets, HPA, ChEMBL, UniProt, PDB
> - the scientific boundary
>
> Read `AGENTS.md` and `docs/parallel_plan.md`. Keep claims exactly as the docs state them.

### T7 — Fallback recording and release

> Make the expo fail-safe for Tauchstone: Second Life. Read `AGENTS.md`, `docs/offline.md` and
> `docs/parallel_plan.md`.
> - **(A)** Add a Playwright script in `tests/e2e/demo_walkthrough.spec.ts`. It drives the real 3-minute
>   demo against the Docker stack (`make up`): volcano, ranking, evidence for Piperacillin with Mol*,
>   attack with two validations and the Learn toggle, then the benchmark. Use realistic pauses and
>   record video at 1920×1080. Add `make record`, which outputs `data/demo/fallback_recording.webm`
>   (and `.mp4` via ffmpeg if available).
> - **(B)** Add `make release`, which rebuilds the bundle (`make demo`), runs `scripts/offline_check.sh`,
>   saves images to `~/Data/tauchstone/expo/expo-images.tar.gz`, and writes a checksum manifest.
> - **(C)** Write a one-page `docs/expo_day_checklist.md`.
>
> Prepare now on mock or current UI. The final recording runs after T1 and T2 merge (Sat evening).

### T8 — Optional single-cell exploratory view

> Only start if T1–T7 are on track. Read `AGENTS.md` and `docs/parallel_plan.md`. From
> `raw/geo/GSE272082` (filtered 10x h5, 9 donors) and `raw/geo/GSE175814`:
> - build pseudobulk per donor and cell type (microglia, astrocytes, excitatory neurons,
>   oligodendrocytes) in `pipelines/singlecell/`;
> - run limma-voom AD vs control per cell type where donors allow, recording n per group;
> - score the top 20 pool drugs against each cell-type signature with `pipelines.lincs.rank`.
>
> Show it in a separate "Exploratory: cell types" panel, clearly labelled **exploratory, not part of
> the preregistered benchmark**. It must not touch the truth table, engine or benchmark.
