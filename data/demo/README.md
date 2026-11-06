# Demo bundle (built, not committed)

`data/demo/processed/` + `MANIFEST.json` are created by `make demo`
(`scripts/make_demo_bundle.py`): exactly the processed files the API reads in
real mode, frozen for the offline expo stack. ~215 MB, 144 files.

Only this README is committed; everything else under `data/demo/` is gitignored.
See `docs/offline.md` for the expo runbook.
