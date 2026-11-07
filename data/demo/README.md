# Demo bundle (built, not committed)

`data/demo/processed/` + `MANIFEST.json` are created by `make demo`
(`scripts/make_demo_bundle.py`): exactly the processed files the API reads in
real mode, frozen for the offline expo stack: about 1.1 GB, 5,800 files, including
the LINCS gold arrays for live screening and `example_signature.csv` for the upload demo.

Only this README is committed; everything else under `data/demo/` is gitignored.
See `docs/offline.md` for the expo runbook.
