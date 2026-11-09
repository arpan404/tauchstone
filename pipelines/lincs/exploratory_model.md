# Exploratory structure model

`train_model(data_dir: Path, algorithm='random_forest', seed=20261105)` returns a JSON-safe report and writes artifacts under `processed/models/exploratory/`. `predict_candidate(data_dir, candidate_id)` returns the stored prediction, observed discovery score and split for a compound in that run. It never loads a pickle, and it raises `ValueError` for a missing candidate. Training supports only the fixed random forest configuration.

Run from the repository root:

```sh
uv run python -m pipelines.lincs.exploratory_model --data-dir "$TS_DATA_DIR"
uv run pytest -q pipelines/lincs/test_exploratory_model.py
```

Training data comes only from `processed/lincs/compounds.parquet` and `processed/scores/GSE132903__gold_permctl__compound_ranking.parquet`. The ranking sidecar must match its checksum and must identify GSE132903 main, gold, permutation control and ranking-context-only standardisation. `aggregate.py` filters to ranking contexts before it takes compound medians. The model never opens the underlying context scores or the signature. The source provenance has empty upstream input checksums. This model records the two input checksums it reads plus the ranking sidecar checksum, but it cannot repair that upstream audit gap.

Fingerprints are Morgan radius 2 with 1024 bits. Bemis-Murcko scaffolds define the groups. For acyclic structures the group is the non-isomeric canonical structure, so stereoisomers stay together. Canonical duplicates cannot cross folds. GroupShuffleSplit selects 20% of groups, which need not be 20% of rows. No setting was chosen by looking at the internal test. The mean baseline learns only from training targets. Training excludes missing or invalid structures and nonfinite targets and records how many it dropped. No covariates are imputed.

`internal_test_scaffold` refers only to this model's internal test, which is separate from the preregistered held-out evidence. Predictions on train rows are in-sample and must not be presented as evaluation. The saved forest is fit on the training fold only. The prediction table stores both folds so a candidate can be looked up locally. Report previews show at most 30 internal-test compounds. Metrics can be null when undefined, and a negative R2 is kept as is.

Every artifact has a provenance sidecar. `modelparameters.json` records settings and packages as plain JSON. `model.joblib` is generated locally, and no API in this module accepts or loads user pickle files. Each run overwrites the previous one at the fixed output location, so callers should run one training at a time and not read while it writes.

The model estimates how well discovery reversal scores generalize across chemical structures. It gives no independent biological confirmation, changes no official rankings and makes no clinical claim. Related scaffolds can stay similar across folds. Salts and tautomers are not standardized, and row metrics count duplicated structures separately. Scientific interpretation needs human review.
