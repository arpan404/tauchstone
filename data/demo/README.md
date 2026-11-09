# Demo bundle (built, not committed)

`make demo` (`scripts/make_demo_bundle.py`) creates `data/demo/processed/` and
`MANIFEST.json`. They hold exactly the processed files the API reads in real mode,
frozen for the offline expo stack. That comes to about 1.1 GB and 5,800 files, including
the LINCS gold arrays for live screening and `example_signature.csv` for the upload demo.

Only this README is committed. Everything else under `data/demo/` is gitignored.
`docs/offline.md` has the expo runbook.
