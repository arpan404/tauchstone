# Offline expo runbook

The full app (FastAPI + React) runs from `docker compose up` with Wi-Fi OFF.
The api container only ever sees the frozen demo bundle (`data/demo`). It never sees
raw data or the multi-GB LINCS matrices.

## What the bundle is

`make demo` copies exactly the processed files the API reads in real mode
(traced from `services/api/app/services/repository.py`) into
`data/demo/processed/`. It also writes `data/demo/MANIFEST.json` (sha256 + size per file
+ git commit). Contents as of Nov 2026:

- `signatures/`: GSE132903 main + composition_adjusted + samples, GSE173955 and
  GSE53697 main + samples, and provenance sidecars. The demo needs the held-out
  cohorts because the API serves them once a session reveals them.
- `scores/`: candidate pool, full context_scores, compound ranking + sidecars, and the
  theta sidecar `GSE132903__gold_permctl__permutation_null.parquet.provenance.json`.
  context_scores is only 3.7 MB, so it stays whole with no pool filtering. The theta
  sidecar is the JSON only. The API reads `parameters.theta` from it and never needs
  the 26 MB null distribution itself.
- `lincs/landmark_order.parquet` (query-set construction), `evidence/*.parquet`,
  all `evidence/structures/*.cif`, `tauchstone/truth_table.parquet`,
  `tauchstone/benchmark_summary.json`
- MVP additions:
  - `lincs/`: the gold rows only (113,310 of 312,438) of `level5_landmark_f32`,
    `order_i16`, `rank_i16` and `sig_info`, plus `context_split`, `genes`, `compounds`
    for live screens and lookup. A screen on the sliced arrays matches the frozen
    ranking to 1e-15.
  - `evidence/gaps.parquet`, `evidence/molecules/*.json` (3D molecules),
    `evidence/ot_drug_molecule.parquet` (Open Targets names and synonyms for
    brand-name lookup), `resources/agreement.parquet`.
  - `scores/GSE173955__main__compound_ranking` and
    `GSE132903__composition_adjusted__compound_ranking`. Only ad-hoc tests read
    these, and only after an experiment is committed.
  - `example_signature.csv` (upload demo) and an empty `app/` mount point.
- Total: about 5,800 files, 1.1 GB. Left out on purpose: non-gold LINCS rows,
  permutations (39 MB), cell_scores, signature_scores, `_interim`, PNGs/QC markdown.

The api container mounts `data/demo` read-only. `compose.yaml` puts a 512 MB tmpfs
at `/data/app` for the project store, so every restart starts clean.

Two things live in the api image rather than the bundle: `data/manifests/preregistration.yaml`
(the engine's source of truth for config) and `pipelines/` (scoring + tauchstone engine).

`data/demo/*` is gitignored except `README.md`. The bundle is built, not committed.

## Set up the second laptop (do this the night before, with network)

On the build machine:

```sh
make demo
docker save tauchstone-api:latest tauchstone-web:latest | gzip > expo-images.tar.gz
```

Copy three things to the expo laptop by USB stick or cable: `expo-images.tar.gz`
(sizes below), the whole `data/demo/` directory (~1.1 GB), and this repo (for `compose.yaml`).

On the expo laptop, which needs only Docker 28 and this repo:

```sh
gunzip -c expo-images.tar.gz | docker load
cp -r <usb>/demo ./data/demo          # so that ./data/demo/processed + MANIFEST.json exist
docker compose up -d                   # or: make up
curl -fsS http://localhost:8080/api/health   # {"status":"ok","mock":false}
```

Rough transfer sizes, measured on this machine in Nov 2026:

- api image: 1.52 GB uncompressed
- web image: 85 MB
- both images gzipped in one tarball: 352 MB
- bundle: about 1.1 GB on disk since the MVP added the LINCS gold arrays

Plan for about 1.5 GB per laptop.

`docker compose build` tags the images with the worktree id. You don't need to retag them,
because `docker load` plus the same `compose.yaml` works as is. If you want stable names,
run `docker tag <project>-api tauchstone-api:expo` and set `image:` to match.

## Wi-Fi-off rehearsal checklist

1. `make demo` rebuilds the bundle and images from current sources.
2. `sh scripts/offline_check.sh` builds, then runs two phases.
   - Phase 1 runs the stack on an `internal: true` Docker network with no egress.
     Host-published ports do nothing there, so the checks run from inside the api
     container through the web proxy at `http://web`.
   - Phase 2 runs plain `docker compose up` and repeats the checks from the host.
   - In both phases the script curls every endpoint through the web proxy for pool
     ranks 1, 5 and 12, runs one attack and one reveal, confirms the held-out signature
     returns 403 before the reveal and 200 after, fetches one `.cif`, and fetches the web index.
   - Any failure exits non-zero.
3. Extra: `make up && TS_OFFLINE_TEST=1 uv run pytest tests/offline/ -q && make down`.
4. In a browser with Wi-Fi off, open `http://localhost:8080`. Confirm there is no
   mock ribbon, run one attack to a reveal, and confirm the 3D viewer loads.
   The `.cif` is served same-origin and Mol* itself is bundled.
5. Physically turn Wi-Fi off and repeat step 4. This is the real test.

Port conflicts break `up`. The usual culprit is another `make api` dev server on :8000,
or anything on :8080. Stop it, or remap with
`TS_API_PORT=18000 TS_WEB_PORT=18080 make up`. These are the same variables as
`OFFLINE_API_PORT`/`OFFLINE_WEB_PORT` in `offline_check.sh`.

## Recovery at the expo

| Symptom | Fix |
|---|---|
| `docker compose up` fails: port in use | `docker ps` / `lsof -i :8000 -i :8080`; stop the other server or remap ports (above) |
| api unhealthy (`/health` fails) | `docker compose logs api`. It is almost always a bad or missing `./data/demo` mount. Compare with `MANIFEST.json` and rebuild with `make demo` |
| web shows mock ribbon / mock data | The web image was built without `VITE_USE_MOCK=0`. Rebuild with `docker compose build web` |
| 3D viewer "unavailable" | Check that `/api/structures/<pdb>.cif` returns 200. The viewer falls back to a download link and the rest of the demo still works |
| Nothing works, 5 min to showtime | `docker compose down && docker compose up -d`, wait 60 s, `curl /api/health`. Last resort is `make demo`, which needs network only for the first image build, so the base layers must already be cached |

`make demo` and the image builds need network ONLY the first time, for base image
pulls and bun/pip installs. Once the images are built and transferred, everything runs offline.
