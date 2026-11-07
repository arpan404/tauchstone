# Tauchstone MVP — build plan (supersedes the S1–S7 tracks in `parallel_plan.md`)

Expo **Mon Nov 9**. UI freeze **Sun Nov 8, 4 pm**. Code freeze **Sun 8 pm**.

**Design reference:** `docs/design/mvp_mockup.html`. Open it in a browser and click through all
9 screens. Build to that look and behaviour.

## Product

Tauchstone is a workbench for Alzheimer's research labs. A lab:
- runs a **live drug screen** against a disease signature (built-in, or its own uploaded CSV);
- reviews candidates with their **evidence and evidence gaps**;
- checks its **own compound list**;
- **attacks** the candidates it cares about;
- exports a **report**.

The preregistered benchmark (Validation screen) is the proof that the attack strategy works.

The design should look like a product a lab would buy, not a statistics report:
- light, warm off-white surfaces, ink text, one violet accent, coral for failure, green for survival, amber for gaps;
- cell and molecule simulations instead of abstract spheres;
- **no explanatory sentences in the UI**: labels, numbers, chips and actions only. The required boundary line stays in the footer.

## Non-negotiable

- **Frozen:** `data/manifests/preregistration.yaml`, `processed/tauchstone/truth_table.parquet`,
  the benchmark outputs, and the rules in `contracts/algorithms.md`. Validation shows exactly
  `benchmark_summary.json`.
- **Anything outside the sealed preregistered set is labelled `not preregistered`.** That covers uploaded
  signatures, pasted compounds, hidden tests built on the fly, and cross-resource results. None of it
  ever feeds the benchmark.
- Everything in `AGENTS.md` still applies: no clinical language, exposure always labelled
  measured / predicted, a structure is never binding evidence, and hidden outcomes never reach the
  browser before a reveal.
- Must run **offline** from the Docker bundle on the expo laptop.

## What already exists on `main` (keep and reuse)

- Light shadcn research workspace, candidate discovery, compare, and local investigation notes.
- Evidence view, Mol* protein panel, attack view with recommendation rationale, benchmark view,
  About, single-cell exploratory panel, and lab copilot/model views.
- API:
  - `/signatures/{cohort}`, `/candidates`, `/candidates/{id}/evidence`
  - `/attack`, `/attack/{id}/run`
  - `/benchmark`, `/structures/{pdb}.cif`
  - `/status`, `/chat`, `/model/*`
  - single-cell routes
- The engine (`pipelines.lincs.rank` scores 113,310 gold signatures in about 16 s), the Tauchstone engine
  (`pipelines.tauchstone`), evidence tables, and the offline Docker bundle.

**Lab copilot / AI model views:** keep them only if they work fully offline and use no clinical
language. Otherwise hide them behind a flag for the expo build. The orchestrator decides.

## What to build (tracks)

| Track | Scope | Owns | Needs real data |
|---|---|---|---|
| **A. Jobs and projects** | Projects (built-in GSE132903, built-in GSE173955, user-created). `POST /projects`, `GET /projects`. `POST /screens` takes a built-in signature id or an uploaded CSV (gene symbol or Entrez, log2FC, statistic, FDR). The CSV is validated and mapped to Entrez, then a background job runs `pipelines.lincs.rank` scoring on gold signatures (mmap, kept warm). `GET /screens/{id}/events` streams progress over SSE: signatures scored, elapsed time, and the top hits as they finalise. Results are stored per project (Parquet plus a small SQLite/DuckDB index). A screen of a built-in signature reproduces the frozen ranking exactly. | `services/api/app/{routes,services}/jobs*`, `projects*`, `pipelines/lincs/` (a job wrapper only, no scoring changes) | yes (verify on Arpan's Mac) |
| **B. App shell and design** | The new design system: tokens from the mockup (`--ac #5b3df5`, `--bad #ef4b3f`, `--ok #12a36a`, `--warm #f29b38`, `--pink #e85d9c`, bg `#f6f5f1`). Sidebar with project scope: Projects, Screen, Candidates, Drug, Compare, My compounds, Attack, Report, Validation. Restyle the existing views to the mockup and remove commentary text. | `apps/web/src/components`, `apps/web/src/index.css`, `apps/web/src/App.tsx`, every `apps/web/src/features/*` view shell | no (mock mode) |
| **C. Simulations and molecule** | A cell simulation (canvas or WebGL) whose state follows the screen job: idle, scoring (molecules flow to cells), done (bound cells glow). A ball-and-stick molecule viewer that renders **real 3D coordinates** for each drug (from track D; never a fake shape). Small per-test cell glyphs in Attack. 60 fps, reduced-motion respected, offline. | `apps/web/src/features/simulation/` (new), `apps/web/src/features/molecule/` (new) | no |
| **D. Evidence data** | A per-drug **evidence-gap table**: brain-cell support (any ranking context in SHSY5Y, NEU, NEU.KCL, MNEU.E, NPC, NPC.CAS9, NPC.TAK, FIBRNPC, with consensus vs θ), dose range, time points, cancer-lines-only flag, predicted or measured exposure, and targets present. **3D coordinates** from each drug's SMILES (RDKit ETKDG plus MMFF, seed fixed; store atoms and bonds as JSON). A **name-lookup index** (pert_iname, drug_map names, synonyms). **On-the-fly hidden tests** for drugs outside the truth table (held-out LINCS contexts under the frozen θ and survive rule, plus measured exposure), labelled `not preregistered`. API: `GET /drugs/{id}` (evidence + gaps + contexts + molecule), `POST /lookup`. | `pipelines/evidence/gaps.py`, `pipelines/evidence/molecule3d.py`, `pipelines/evidence/lookup.py`, `pipelines/tauchstone/adhoc.py`, `services/api/app/routes/drugs.py`, `lookup.py` | yes |
| **E. Cross-resource agreement** | Fetch and cache, ahead of time, the rank of our top 100 in Perturb-Seqr (Ma'ayan lab, `https://perturbseqr.maayanlab.cloud/`; find its API) and CLUE (once `TS_CLUE_API_KEY` exists), queried with our top 150 up and 150 down genes. Store under `processed/resources/`. `GET /drugs/{id}/resources`. Report-only, labelled. If a resource has no API, record that and show "not available". | `pipelines/resources/`, `services/api/app/routes/resources.py` | yes, plus network |
| **F. Reports, compare, export** | A one-page drug report (the mockup's Report screen) as HTML, then PDF (WeasyPrint, or a print stylesheet plus the browser), with provenance and preregistration hash. CSV export of candidates. The compare view lines up the gap rows. | `services/api/app/routes/reports.py`, `apps/web/src/features/report/` | no (fixtures), verify with real data |
| **G. Release** | Add the gold LINCS arrays (about 0.9 GB: gold rows only of `level5_landmark_f32`, `order_i16` and `rank_i16`, plus `sig_info`) to the demo bundle so live screening runs offline. Update `make demo` and `scripts/offline_check.sh` (add: one screen job end to end, one lookup, one report). Playwright walkthrough of the mockup flow, `make record` for the fallback video, and an update to `docs/expo_day_checklist.md`. | `scripts/`, `Makefile`, `compose.yaml`, `tests/e2e/` | final run on Arpan's Mac |

Dependencies:
- B, C and D start immediately.
- A starts immediately; its UI hooks need B's shell.
- F starts with fixtures.
- E starts immediately (network).
- G prepares now and runs the final pass after the UI freeze.

## API additions (contract)

Add them to `contracts/openapi.yaml`, regenerate the web types (`bun run gen:api`), and make
`check:api` pass:
- `GET /projects`, `POST /projects`
- `POST /screens` (multipart CSV or `{signature_id}`)
- `GET /screens/{id}`, `GET /screens/{id}/events` (SSE)
- `GET /projects/{id}/candidates?approved=&brain_cells=&penetrant=&min_contexts=`
- `GET /drugs/{id}` (evidence, gaps, contexts, molecule, preregistered flag)
- `POST /lookup`
- `POST /attack` gains `preregistered: bool` in the response
- `GET /drugs/{id}/resources`
- `GET /reports/{drug_id}` (HTML) and `/reports/{drug_id}.pdf`

## Acceptance (the demo path must work on real data, offline)

1. Projects, then **Run screen** on GSE132903. Progress streams, and it finishes in under 30 s
   with the frozen top 12 in the same order.
2. Upload a small CSV (provide `data/demo/example_signature.csv` made from GSE173955). It ranks, and
   its candidates are labelled not preregistered.
3. Candidates: the four filters work. **Cholic acid** shows brain-cell data (NEU).
4. Drug **Piperacillin**:
   - real 3D molecule;
   - gap chips: cancer lines only, 10 µM, 6 h, exposure predicted low, no recorded targets;
   - the context map;
   - resources panel.
5. My compounds: `donepezil, memantine, galantamine, rivastigmine, nepafenac` gives real pool ranks
   (684, 502, 1214, not rankable, 2) and Attack or Build tests per row.
6. Attack Piperacillin: composition-adjusted fails, and P(claim) goes 0.24 → 0.00.
7. The report PDF downloads.
8. Validation equals `benchmark_summary.json`.
9. `scripts/offline_check.sh` passes with networking off.

## Machines, accounts and models

Use every machine and account, and keep each track on one branch.

- **Arpan's Mac** (has the real data):
  - OpenCode `opencode-go/muse-spark-1.3-contributor`
  - Claude Opus 5.5 (local)
  - Codex `gpt-6.1-sol` (account `346`)
  - Cursor (`w10`, `ar`)
  - Tracks D, E and A's real-data verification run here.
- **Rijan's Mac** (no real data; mock mode plus fixtures):
  - Codex `gpt-6.1-sol` on Sandarva, Shreyak and Rijan
  - OpenCode Muse Spark
  - Cursor, Antigravity
  - Tracks B, C, F and A's code run here.
- Every branch is verified on Arpan's Mac against real data before it merges to `main`.
