# Tauchstone: Second Life — plan for the remaining work (parallel agents)

> **Superseded by [`mvp_plan.md`](mvp_plan.md)** (Nov 7). Kept for history.

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

## Tracks (site-first: the website is the pitch; there is no separate slide deck)

They run in parallel and each owns its own folders. Only the orchestrator edits `apps/web/src/App.tsx`
to wire in new screens, at merge time.

| ID | Track | Owns (folders) | Where it runs | Size |
|---|---|---|---|---|
| S1 | Lab-instrument restyle of all 5 views + benchmark view leads with accuracy and p-values | `apps/web/src/index.css`, `apps/web/src/components/`, `apps/web/src/features/{disease-signature,repurposing,evidence,protein-viewer,tauchstone,benchmark}/` | Rijan's Mac | 1 day |
| S2 | 3D expo scene (Three.js), optional full-screen mode | `apps/web/src/features/expo-scene/` (new); `three` in `apps/web/package.json` | Rijan's Mac | 1 day |
| S3 | Story mode (the 3-minute guided walkthrough with the key numbers on screen) + landing screen | `apps/web/src/features/story/` (new), `apps/web/src/features/landing/` (new) | Rijan's Mac | 1 day |
| S4 | Science loose ends: 2 odd exposure rows, Mol* structure check, CLUE cross-check | `pipelines/evidence/`, `pipelines/lincs/clue.py`, `tests/redteam/`, `docs/qa_report.md` | Arpan's Mac (needs the real data) | half a day |
| S5 | Judge-facing README, in-site "How it works" and integrity text | `README.md`, `docs/` (except `figures/`), `apps/web/src/features/about/` (new) | Rijan's Mac | half a day |
| S6 | Reliability: Playwright demo walkthrough (also records the fallback video), `make release`, expo-day checklist | `tests/e2e/` (new), `scripts/`, `Makefile` release targets | Rijan's Mac to build; final recording on Arpan's Mac | half a day |
| S7 | Optional: single-cell exploratory panel (never enters the benchmark) | `pipelines/singlecell/`, `apps/web/src/features/single-cell/` | only if S1–S6 are on track | 1 day |

Timeline:
- **Fri:** S1–S6 start.
- **Sat noon:** S1, S2, S3 merged; the orchestrator wires the screens into `App.tsx`.
- **Sat evening:** UI freeze. S6 records the fallback video on Arpan's Mac with real data.
- **Sun:** human rehearsal with Wi-Fi off. Code freeze at 8 pm.

**Data on Rijan's Mac:** there is no real data there, so UI tracks build against mock mode
(`TS_API_MOCK=1 make api` + `VITE_USE_MOCK=0 bun run dev`, or `VITE_USE_MOCK=1`). The orchestrator on
Arpan's Mac checks every branch against real data (`TS_API_MOCK=0`) before merging.

## Human tasks (Arpan / Rijan)

1. Register the CLUE academic account and put the key in `.env` on Arpan's Mac as `TS_CLUE_API_KEY=...` (unblocks S4 part C).
2. Science look-over: the signature, the top 20 and the claim wording. 30 min, Sat morning.
3. Sun: rehearse the 3-minute and 90-second versions with Wi-Fi off on both laptops (`docs/offline.md`).

---

## Agent briefs (the orchestrator pastes these; each agent also reads this file)

Common to every brief: read `AGENTS.md` and `docs/parallel_plan.md`, stay in your folders, keep
every existing test green, don't touch `App.tsx` (S1 excepted), push your branch to `origin`,
and open a PR to `main` with screenshots for UI work and anything you could not verify.

### S1 — Lab-instrument restyle

> Restyle the Tauchstone: Second Life web app (`apps/web`; React 19, Vite 8, Tailwind v4, shadcn/ui,
> ECharts, Mol*) as a credible **lab instrument** on an expo monitor seen from 3 m:
> - dark graphite surface, fine grid texture, monospace readouts for numbers
> - teal for reversal and focus, amber for warnings, red only for failures, green only for survives
>
> Put the look in design tokens in `index.css` and apply them across Signature, Candidates, Evidence,
> Attack and Benchmark.
> - **Attack view:** P(claim) as a large readout with a live trace across reveals. Hidden tests are
>   "sample wells", sealed until run, pulsing when recommended, red or green on reveal. One big Run
>   validation button.
> - **Benchmark view:** lead with decision accuracy after 5 tests per policy (with CIs) and the
>   Holm-corrected p-values against random and greedy (`/benchmark` field `tests`). The
>   median-experiments chart is a tie, so put it below.
> - Keep the boundary banner text exactly as it is. Keep every data binding, keyboard shortcut (1–5),
>   focus ring and test. Respect prefers-reduced-motion.
> - Check at 1280×800 and 1920×1080. Done = build, typecheck, lint, test and check:api pass, plus
>   screenshots of all 5 views.

### S2 — 3D expo scene

> In `apps/web/src/features/expo-scene/`, build an optional full-screen **expo mode** with Three.js (add
> only `three` and `@types/three`). Export one lazily loaded component `<ExpoScene onClose />`; the
> orchestrator wires the entry point.
> - **Scene:** the AD signature as a slowly rotating sphere of genes, from the real
>   `/signatures/GSE132903` response. Position by gene index, colour by sign of `stat` (up warm, down
>   teal), size by |stat|, and the `query_set` genes brighter. The selected drug sits at the centre with
>   a ring showing P(claim). Its hidden tests orbit as labelled nodes (`contexts` from the attack session).
> - **Run validation** calls the same API hooks (`src/api/hooks.ts`). A beam travels to the recommended
>   node, the node turns red or green, and the ring animates to the new P(claim).
> - Use a single `Points` geometry for about 16k genes and hold 60 fps on an M-series MacBook. Show a
>   message if WebGL is missing. Respect prefers-reduced-motion. Dispose the WebGL context on close.
>   It must work offline.
> - Done = a full attack runs inside the scene on mock data, with a short recording in the PR.

### S3 — Story mode and landing screen

> The website is the pitch, so there is no slide deck. Build two new screens:
> - **(a)** `apps/web/src/features/landing/`: one screen.
>   - Title: "Tauchstone: Second Life".
>   - Line: "Find a drug. Attack the hypothesis. Keep only what survives."
>   - Three numbers, read live from the API: drugs ranked (candidates `n_ranked`), hidden tests
>     prepared, and the benchmark headline (decision accuracy after 5 tests, Tauchstone vs random, from
>     `/benchmark`).
>   - The boundary sentence, and a "Start the 3-minute tour" button.
> - **(b)** `apps/web/src/features/story/`: a guided walkthrough that drives the real views in order,
>   with a step bar, Next and Back, a timer, and an on-screen caption per step.
>   - 0:00 volcano: "Alzheimer's changes these genes in 195 human brains".
>   - 0:20 ranking: "We scored every LINCS drug three ways; negative means it pushes the disease
>     pattern back".
>   - 0:50 evidence card plus Mol* for a demo candidate: "Is the target in the brain? Does the drug
>     reach the brain, measured or only predicted?".
>   - 1:15 attack: run validation twice with the Learn toggle; "Now we try to break it".
>   - 2:15 benchmark: "Across 50 sealed drugs, the attack reaches the right call in fewer tests".
>   - 2:40 boundary and close.
>   - Captions use only numbers fetched from the API. Never hard-code results.
> - Export `<Landing onStart />` and `<StoryMode onExit />`; the orchestrator wires them. Use the
>   existing Zustand store (`src/store/ui.ts`) to switch views and selected candidate. If you need new
>   store fields, add them in `src/store/story.ts`.
> - Done = the tour runs end to end on mock data, with a recording in the PR.

### S4 — Science loose ends (Arpan's Mac, real data)

> Without changing any frozen output (truth table, benchmark, preregistration):
> - **(A)** The two flagged exposure rows, locked as xfail in `tests/redteam/test_exposure_bounds.py`:
>   look up the ChEMBL assays, decide whether each is a real value or a parse error, and document it in
>   `docs/qa_report.md`. If a parse is wrong, fix `pipelines/evidence/exposure.py` and report which
>   truth-table rows it would change. Do not rebuild or rerun anything frozen.
> - **(B)** For the targets of pool ranks 1–10, confirm each structure has a local `.cif` that parses
>   and that `GET /structures/{id}.cif` serves it.
> - **(C)** Once `TS_CLUE_API_KEY` is set: add `pipelines/lincs/clue.py`, query CLUE with our top 150
>   up and 150 down genes (from `pipelines.lincs.scoring.build_query_sets`), cache the response, and
>   report the Spearman correlation between CLUE tau and our consensus for overlapping top-50
>   compounds. Report only.

### S5 — README and in-site "How it works"

> - Rewrite `README.md` for judges:
>   - what it does in 5 lines, plus screenshots (Arpan's Mac can provide them after S1)
>   - the headline result, with links to `docs/integrity_log.md` and the frozen preregistration hash
>   - how to run offline (`docs/offline.md`) and reproduce from scratch
>   - a Mermaid architecture diagram, data sources with licences, and the scientific boundary
> - Also build `apps/web/src/features/about/`: an in-site "How it works and how we kept it honest"
>   panel, exporting `<About />`. It contains a pipeline diagram and the integrity log as a readable
>   timeline (render `docs/integrity_log.md` content, copied into a TS module), the preregistration
>   hash, and the honest limitations: the permutation gate not met at 17/20; the top 5 not beyond the
>   null; the decision-aware co-primary not beating random.
> - Use only claims as the docs state them.

### S6 — Reliability and fallback

> - **(A)** `tests/e2e/demo_walkthrough.spec.ts` (Playwright): drives the 3-minute demo against the
>   Docker stack (`make up`): volcano, ranking, Piperacillin evidence with Mol*, attack with two
>   validations and the Learn toggle, then the benchmark. Use realistic pauses and record video at
>   1920×1080. `make record` writes `data/demo/fallback_recording.webm` (and `.mp4` if ffmpeg exists).
>   Make it work on mock data now; the final recording runs on Arpan's Mac with real data after the UI
>   freeze.
> - **(B)** `make release`: rebuild the bundle (`make demo`), run `scripts/offline_check.sh`, save
>   images to `~/Data/tauchstone/expo/expo-images.tar.gz`, and write a checksum manifest.
> - **(C)** A one-page `docs/expo_day_checklist.md`.

### S7 — Optional single-cell exploratory panel

> Only start if S1–S6 are on track. Build pseudobulk per donor and cell type from GSE272082 and
> GSE175814, run limma-voom AD vs control per cell type, and score the top 20 pool drugs against each.
> Show it in a separate panel labelled **exploratory, not part of the preregistered benchmark**. It
> never touches the truth table, engine or benchmark.
