# Exploratory structure model

`train_model(data_dir: Path, algorithm='random_forest', seed=20261105)` returns a JSON-safe report and writes artifacts under `processed/models/exploratory/`. `predict_candidate(data_dir, candidate_id)` returns the stored prediction, observed discovery score and split for a compound in that run. It never loads a pickle. Missing candidates raise `ValueError`. Training supports only the fixed random forest configuration.

Run from the repository root:

```sh
uv run python -m pipelines.lincs.exploratory_model --data-dir "$TS_DATA_DIR"
uv run pytest -q pipelines/lincs/test_exploratory_model.py
```

Only `processed/lincs/compounds.parquet` and `processed/scores/GSE132903__gold_permctl__compound_ranking.parquet` supply training data. The ranking sidecar must match its checksum and identify GSE132903 main, gold, permutation control and ranking-context-only standardisation. `aggregate.py` filters to ranking contexts before compound medians. The model does not open the underlying context scores or signature. The source provenance has empty upstream input checksums; this model records the two actual input checksums and the ranking sidecar checksum, but cannot repair that upstream audit gap.

Morgan radius 2 fingerprints have 1024 bits. Bemis-Murcko scaffolds define groups. Acyclic structures use non-isomeric canonical structures as groups, so stereoisomers stay together. Canonical duplicates cannot cross folds. GroupShuffleSplit selects 20% of groups, which need not be 20% of rows. No settings are selected against the internal test. The mean baseline learns only from training targets. Missing or invalid structures and nonfinite targets are excluded with counts; no covariates are imputed.

`internal_test_scaffold` refers only to this model's internal test. It is separate from the preregistered held-out evidence. Train-row predictions are in-sample and must not be presented as evaluation. The saved forest fits the training fold only. The prediction table stores both folds for local candidate lookup. Report previews contain at most 30 internal-test compounds. Metrics can be null when undefined. Negative R2 is retained.

Every artifact has a provenance sidecar. `modelparameters.json` records settings and packages as plain JSON. `model.joblib` is a locally generated export; no API in this module accepts or loads user pickle files. Artifacts overwrite the previous run at the fixed output location, so callers should serialize training and avoid reads during writes.

This estimates chemical generalization of discovery reversal scores. It provides no independent biological confirmation, changes no official rankings and makes no clinical claim. Related scaffolds can remain similar across folds. Salts and tautomers are not standardized, and row metrics weight duplicated structures separately. Human review is required for scientific interpretation.
