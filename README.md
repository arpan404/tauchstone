# Tauchstone: Second Life

Find a drug. Attack the hypothesis. Keep only what survives.

Ranks existing drugs whose LINCS L1000 response reverses an Alzheimer's brain expression
signature (GEO), then tries to falsify each candidate on held-out evidence under a fixed budget.

> Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not
> establish efficacy, safety, dosing, brain exposure or clinical benefit.

## Setup

Needs Homebrew R (`brew install r libxml2 pkgconf`), uv, bun, Docker.

```sh
make setup          # Python (uv), R (renv), web (bun)
make data           # download + checksum all sources into $TS_DATA_DIR (~33 GB)
make unpack-lincs   # decompress LINCS GCTX (~29 GB more)
make dev            # API :8000 + web :5173
make test test-r
```

Data lives in `$TS_DATA_DIR` (default `~/Data/tauchstone`), outside git.
Agents and contributors: read [AGENTS.md](AGENTS.md).
