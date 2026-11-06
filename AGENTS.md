# Tauchstone: Second Life — agent guide

Research platform: rank existing drugs whose LINCS L1000 response reverses an Alzheimer's
brain expression signature (Second Life), then try to falsify each candidate on held-out
evidence under a fixed budget (Tauchstone). Expo is Mon Nov 9 2026; code freeze Sun Nov 8, 8 pm.

## Rules that are not negotiable

1. **No leakage.** Nothing from a held-out context (GSE173955, GSE53697, held-out LINCS
   contexts, composition-adjusted ranks, exposure lookups) may feed signature construction,
   drug ranking, threshold θ, λ tuning, or demo-candidate choice. If you are unsure whether
   something is held-out, check `data/manifests/preregistration.yaml` and ask.
2. **Never merge cohorts** into one test. Each cohort gets its own signature.
3. **Sign convention:** signatures are AD minus control (positive = up in AD). A drug
   reverses the disease when its score is negative. Check direction on known genes
   (e.g. GFAP up, SST/VGF down in AD cortex) before trusting any output.
4. **Join key is Entrez Gene ID, stored as a string** (LINCS uses Entrez). Carry HGNC
   symbol and Ensembl as extra columns.
5. **Every processed output gets provenance**: use `pipelines/common/provenance.py`
   (Python) or write the same JSON fields from R. Record the random seed for anything random.
6. **Missing covariates are recorded as `unspecified`, never imputed.**
7. **No clinical language.** Verdicts are SUPPORTED SO FAR, FRAGILE / CONTEXT-DEPENDENT or
   INSUFFICIENT EVIDENCE, never true/false, never "treats", "effective", "safe", "dose".
   Brain exposure is always labelled measured / curated / predicted. A PDB structure is
   target context, never binding evidence.
8. **The truth table never reaches the browser** except one value per committed experiment.

## Where things live

| Path | What |
|---|---|
| `$TS_DATA_DIR` (default `~/Data/tauchstone`) | `raw/` downloads, `processed/` Parquet. Outside git, shared by all worktrees. Never commit data. |
| `data/manifests/` | `sources.toml` (what to download), `checksums.json` (frozen SHA-256), `preregistration.yaml` |
| `contracts/` | Parquet schemas, `openapi.yaml`, mock fixtures. Frozen before parallel work; change only via the engineering lead. |
| `pipelines/geo/` | WS2, R: QC, limma (arrays), DESeq2 (counts), composition sensitivity |
| `pipelines/lincs/` | WS3, Python: GCTX ingest (`gctx.py`, h5py; cmapPy is broken on NumPy 2), reversal scores, contexts |
| `pipelines/evidence/` | WS4: Open Targets, HPA, ChEMBL, PDB. Cache everything locally; nothing live at demo time. |
| `pipelines/tauchstone/` | WS5: truth table, policies, replay benchmark, evaluation |
| `services/api/app/` | WS6: FastAPI. `TS_API_MOCK=1` serves `contracts/fixtures`. |
| `apps/web/src/features/` | WS7: React. One folder per feature. Boundary banner on every page. |
| `tests/` | WS8: `leakage/`, `permutation/`, `api_contract/` |

## Commands

`make help` lists everything. Common: `make setup`, `make data`, `make unpack-lincs`,
`make test`, `make test-r`, `make lint`, `make dev` (API :8000 + web :5173).

- Python: `uv run ...` (Python 3.12, deps pinned in `uv.lock`). Add deps with `uv add`.
- R: run `Rscript` from the repo root so `.Rprofile` activates renv. Add packages with
  `renv::install()` then `renv::snapshot()`. If conda is on PATH, native R builds break;
  `scripts/setup_r.R` strips it.
- Web: `cd apps/web && bun ...`. UI components via `bunx shadcn@latest add <name>`.

## Working as a workstream agent

- Stay inside your workstream's folder. Do not edit another workstream's files or `contracts/`;
  if the contract is wrong, say so in your summary.
- One branch per workstream; only the engineering lead merges.
- Write tests next to what you build. Tests that need real data use `@pytest.mark.data`.
- Report what you could not verify, especially anything scientific. A human signs off on
  every signature, threshold and claim wording.
