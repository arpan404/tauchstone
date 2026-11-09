# Tauchstone: Second Life agent guide

Second Life ranks existing drugs by how strongly their LINCS L1000 response reverses an
Alzheimer's brain expression signature. Tauchstone tries to falsify each candidate on held-out
evidence under a fixed budget. The expo is Mon Nov 9 2026; code freezes Sun Nov 8 at 8 pm.

## Non-negotiable rules

1. **Keep held-out data out.** Held-out means GSE173955, GSE53697, held-out LINCS contexts,
   composition-adjusted ranks and exposure lookups. None of it may feed signature construction,
   drug ranking, threshold θ, λ tuning or demo-candidate choice. If unsure, check
   `data/manifests/preregistration.yaml` and ask.
2. **Give each cohort its own signature.** Never merge cohorts into one test.
3. **Signatures are AD minus control.** Positive means up in AD; a negative drug score means
   reversal. Before trusting any output, check direction on known genes: GFAP up, SST and VGF
   down in AD cortex.
4. **Join genes on Entrez Gene ID, stored as a string.** LINCS uses Entrez. Carry HGNC symbol
   and Ensembl as extra columns.
5. **Write provenance for every processed output** with `pipelines/common/provenance.py`, or
   the same JSON fields from R. Record the random seed for anything random.
6. **Record missing covariates as `unspecified`.** Never impute them.
7. **Write research language, never clinical language.**
   - Verdicts are SUPPORTED SO FAR, FRAGILE / CONTEXT-DEPENDENT or INSUFFICIENT EVIDENCE.
     Never true/false, never "treats", "effective", "safe", "dose".
   - Label brain exposure measured / curated / predicted, every time.
   - A PDB structure is target context, never binding evidence.
   - The boundary sentence ("Research hypothesis only...") has fixed wording and appears in the
     PDF report. Arpan removed it from the app shell on Nov 8 2026. `tests/redteam/test_wording.py`
     keeps clinical language out of the UI.
8. **Keep the truth table on the server.** The browser gets one value per committed experiment.

## Where things live

| Path | What |
|---|---|
| `$TS_DATA_DIR` (default `~/Data/tauchstone`) | `raw/` downloads, `processed/` Parquet. Outside git, shared by all worktrees. Never commit data. |
| `data/manifests/` | `sources.toml` (what to download), `checksums.json` (frozen SHA-256), `preregistration.yaml` |
| `contracts/` | Parquet schemas, `openapi.yaml`, mock fixtures. Frozen before parallel work; only the engineering lead changes them. |
| `pipelines/geo/` | WS2, R: QC, limma (arrays), DESeq2 (counts), composition sensitivity |
| `pipelines/lincs/` | WS3, Python: GCTX ingest (`gctx.py` on h5py; cmapPy is broken on NumPy 2), reversal scores, contexts |
| `pipelines/evidence/` | WS4: Open Targets, HPA, ChEMBL, PDB. Cache everything locally; nothing live at demo time. |
| `pipelines/tauchstone/` | WS5: truth table, policies, replay benchmark, evaluation |
| `services/api/app/` | WS6: FastAPI. `TS_API_MOCK=1` serves `contracts/fixtures`. |
| `apps/web/src/features/` | WS7: React, one folder per feature |
| `tests/` | WS8: `leakage/`, `permutation/`, `api_contract/` |

## Commands

`make help` lists everything. Common ones: `make setup`, `make data`, `make unpack-lincs`,
`make test`, `make test-r`, `make lint`, `make dev` (API :8000 + web :5173).

- Python: `uv run ...` (Python 3.12, deps pinned in `uv.lock`). Add deps with `uv add`.
- R: run `Rscript` from the repo root so `.Rprofile` activates renv. Add packages with
  `renv::install()`, then `renv::snapshot()`. Conda on PATH breaks native R builds;
  `scripts/setup_r.R` strips it.
- Web: `cd apps/web && bun ...`. Add UI components with `bunx shadcn@latest add <name>`.

## Working as a workstream agent

- Edit only your workstream's folder. Leave other workstreams' files and `contracts/` alone;
  if a contract is wrong, say so in your summary.
- One branch per workstream. Only the engineering lead merges.
- Write tests next to the code they cover. Mark tests that need real data `@pytest.mark.data`.
- Report what you couldn't verify, especially anything scientific. A human signs off on every
  signature, threshold and claim wording.
