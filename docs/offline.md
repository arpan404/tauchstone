# Offline expo runbook

The full app (FastAPI + React) runs from `docker compose up` with Wi-Fi OFF.
The api container only ever sees the frozen demo bundle (`data/demo`), never
raw data and never the multi-GB LINCS matrices.

## What the bundle is

`make demo` copies exactly the processed files the API reads in real mode
(traced from `services/api/app/services/repository.py`) into
`data/demo/processed/`, plus `data/demo/MANIFEST.json` (sha256 + size per file
+ git commit). Contents (Nov 2026):

- `signatures/`: GSE132903 main + composition_adjusted + samples, GSE173955 and
  GSE53697 main + samples (held-out cohorts are served after a session reveals
  them, so the demo needs them) + provenance sidecars
- `scores/`: candidate pool, full context_scores (3.7 MB, kept whole — no pool
  filtering needed), compound ranking + sidecars, and the theta sidecar
  `GSE132903__gold_permctl__permutation_null.parquet.provenance.json`
  (only the JSON: the API reads `parameters.theta` from it, never the 26 MB
  null distribution itself)
- `lincs/landmark_order.parquet` (query-set construction), `evidence/*.parquet`,
  all 104 `evidence/structures/*.cif`, `tauchstone/truth_table.parquet`,
  `tauchstone/benchmark_summary.json`
- Total: 144 files, ~215 MB (target < 300 MB). Deliberately excluded: LINCS
  `level5/order/rank` matrices (~2.3 GB), permutations (39 MB), cell_scores,
  signature_scores, `_interim`, PNGs/QC markdown.

Baked into the api image (not the bundle): `data/manifests/preregistration.yaml`
(engine config source of truth) and `pipelines/` (scoring + tauchstone engine).

`data/demo/*` is gitignored except `README.md`: the bundle is built, not committed.

## Set up the second laptop (do this the night before, with network)

On the build machine:

```sh
make demo
docker save <project>-api:latest <project>-web:latest | gzip > expo-images.tar.gz
```

Copy to the expo laptop (USB stick / cable): `expo-images.tar.gz` (~sizes below),
the whole `data/demo/` directory (~215 MB), and this repo (for `compose.yaml`).

On the expo laptop (needs only Docker 28 + this repo):

```sh
gunzip -c expo-images.tar.gz | docker load
cp -r <usb>/demo ./data/demo          # so that ./data/demo/processed + MANIFEST.json exist
docker compose up -d                   # or: make up
curl -fsS http://localhost:8080/api/health   # {"status":"ok","mock":false}
```

Rough transfer sizes (measured Nov 2026, this machine): api image 1.52 GB
uncompressed, web image 85 MB, both images gzipped in one tarball 352 MB,
bundle 206 MB on disk (~215 MB bytes) — about 570 MB total per laptop.

Image names contain the worktree id (`docker compose build` tags them); retag
if you want stable names: `docker tag <project>-api tauchstone-api:expo` and
set `image:` accordingly — not required, `docker load` + same `compose.yaml`
works as is.

## Wi-Fi-off rehearsal checklist

1. `make demo` (rebuild bundle + images from current sources).
2. `sh scripts/offline_check.sh` — builds, then:
   - Phase 1 runs the stack on an `internal: true` Docker network (no egress;
     host-published ports are inert there, so checks run from inside the api
     container through the web proxy at `http://web`);
   - Phase 2 runs plain `docker compose up` and repeats the checks from the host.
   - Both phases curl every endpoint through the web proxy for pool ranks 1, 5,
     12, run one attack + one reveal, confirm the held-out signature is 403
     before reveal / 200 after, fetch one `.cif`, and fetch the web index.
   - Any failure exits non-zero.
3. Extra: `make up && TS_OFFLINE_TEST=1 uv run pytest tests/offline/ -q && make down`.
4. In a browser with Wi-Fi off: open `http://localhost:8080`, confirm no
   mock ribbon, run one attack to reveal, confirm the 3D viewer loads
   (`.cif` is served same-origin; Mol* itself is bundled).
5. Physically turn Wi-Fi off and repeat step 4 — this is the real test.

Port conflicts: another `make api` dev server on :8000 (or anything on :8080)
breaks `up`. Either stop it or remap:
`TS_API_PORT=18000 TS_WEB_PORT=18080 make up` (same vars as
`OFFLINE_API_PORT`/`OFFLINE_WEB_PORT` in `offline_check.sh`).

## Recovery at the expo

| Symptom | Fix |
|---|---|
| `docker compose up` fails: port in use | `docker ps` / `lsof -i :8000 -i :8080`; stop the other server or remap ports (above) |
| api unhealthy (`/health` fails) | `docker compose logs api`; almost always a bad/missing `./data/demo` mount — compare with `MANIFEST.json`, rebuild with `make demo` |
| web shows mock ribbon / mock data | Web image built without `VITE_USE_MOCK=0` — rebuild (`docker compose build web`) |
| 3D viewer "unavailable" | Check `/api/structures/<pdb>.cif` returns 200; the viewer degrades to a download link, the rest of the demo is unaffected |
| Nothing works, 5 min to showtime | `docker compose down && docker compose up -d`, wait 60 s, `curl /api/health`; last resort: `make demo` (needs no network except first image build — base layers must already be cached) |

Note: `make demo` and image builds need network ONLY the first time (base image
pulls, bun/pip installs). Once built and transferred, everything runs offline.
