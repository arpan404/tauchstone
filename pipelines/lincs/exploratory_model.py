"""Isolated discovery-score regression from molecular structure. No official ranks change."""
from __future__ import annotations

import argparse
import json
import time
import uuid
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import rdFingerprintGenerator
from rdkit.Chem.Scaffolds import MurckoScaffold
from scipy.stats import spearmanr
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

from pipelines.common.provenance import Provenance, sha256_file

COMPOUNDS = 'processed/lincs/compounds.parquet'
RANKING = 'processed/scores/GSE132903__gold_permctl__compound_ranking.parquet'
OUTPUT = 'processed/models/exploratory'
TASK = 'Predict discovery GSE132903 consensus_median from molecular structure only'
FEATURES = {'type': 'Morgan', 'radius': 2, 'bits': 1024}
PARAMETERS = {'n_estimators': 200, 'min_samples_leaf': 3, 'n_jobs': 2}


def _inputs(data_dir):
    paths = [Path(data_dir) / name for name in (COMPOUNDS, RANKING)]
    rank = paths[1]
    sidecar = rank.with_name(rank.name + '.provenance.json')
    record = json.loads(sidecar.read_text())
    params = record.get('parameters', {})
    if (record.get('step') != 'lincs_rank_compounds'
            or record.get('output_sha256') != sha256_file(rank)
            or params.get('standardisation') != 'ranking-contexts-only'
            or Path(params.get('signature', '')).name != 'GSE132903__main.parquet'
            or params.get('gold_only') is not True
            or params.get('permutation_rule_for_real') is not True):
        raise ValueError('Discovery ranking provenance failed verification')
    compounds = pd.read_parquet(paths[0], columns=['pert_id', 'pert_iname', 'canonical_smiles'])
    scores = pd.read_parquet(rank, columns=['pert_id', 'consensus_median'])
    if compounds.pert_id.duplicated().any() or scores.pert_id.duplicated().any():
        raise ValueError('Duplicate pert_id input')
    return compounds, scores, {str(p): sha256_file(p) for p in [*paths, sidecar]}


def _prepare(compounds, scores):
    merged = scores.merge(compounds, on='pert_id', how='left', validate='one_to_one')
    rows, bits = [], []
    excluded = {'missing_smiles': 0, 'invalid_smiles': 0, 'invalid_target': 0}
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=1024)
    for row in merged.to_dict('records'):
        smiles = row['canonical_smiles']
        if not isinstance(smiles, str) or not smiles.strip():
            excluded['missing_smiles'] += 1
            continue
        mol = Chem.MolFromSmiles(smiles)
        if mol is None or mol.GetNumAtoms() == 0:
            excluded['invalid_smiles'] += 1
            continue
        if not np.isfinite(row['consensus_median']):
            excluded['invalid_target'] += 1
            continue
        canonical = Chem.MolToSmiles(mol, isomericSmiles=True)
        # Non-isomeric scaffold groups stereoisomers together; acyclic molecules
        # use non-isomeric structure, a stricter duplicate grouping than canonical.
        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=mol)
        group = 'scaffold:' + scaffold if scaffold else 'acyclic:' + Chem.MolToSmiles(mol, isomericSmiles=False)
        rows.append(row | {'canonical_structure': canonical, 'group': group})
        bits.append(generator.GetFingerprintAsNumPy(mol))
    frame = pd.DataFrame(rows)
    if len(frame) < 4 or frame['group'].nunique() < 2:
        raise ValueError('Need at least four valid compounds and two structure groups')
    return frame, np.asarray(bits), excluded


def _finite(value):
    return float(value) if np.isfinite(value) else None


def train_model(data_dir: Path, algorithm='random_forest', seed=20261105) -> dict:
    """Train fixed settings, persist local artifacts, return JSON-safe report."""
    if algorithm != 'random_forest':
        raise ValueError('Only random_forest is supported')
    start = time.monotonic()
    compounds, scores, checksums = _inputs(data_dir)
    frame, x, excluded = _prepare(compounds, scores)
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=seed).split(
        x, groups=frame['group']))
    if len(test) < 2:
        raise ValueError('Internal test requires at least two compounds')
    assert not set(frame.iloc[train].group) & set(frame.iloc[test].group)
    assert not set(frame.iloc[train].canonical_structure) & set(frame.iloc[test].canonical_structure)
    y = frame.consensus_median.to_numpy()
    model = RandomForestRegressor(**PARAMETERS, random_state=seed).fit(x[train], y[train])
    baseline = DummyRegressor(strategy='mean').fit(x[train], y[train])
    predicted = model.predict(x[test])
    correlation = spearmanr(y[test], predicted).statistic if np.std(predicted) and np.std(y[test]) else np.nan
    split = {'name': 'internal_test_scaffold', 'method': 'GroupShuffleSplit', 'test_size': .2,
             'seed': seed, 'acyclic_group': 'non-isomeric canonical structure',
             'n_train_groups': int(frame.iloc[train].group.nunique()),
             'n_test_groups': int(frame.iloc[test].group.nunique()),
             'n_unique_groups': int(frame.group.nunique()), 'canonical_overlap': 0, 'group_overlap': 0}
    packages = {p: version(p) for p in ['rdkit', 'scikit-learn', 'numpy', 'pandas', 'scipy', 'joblib', 'pyarrow']}
    provenance = Provenance(step='exploratory_structure_model', dataset_accession='GSE132903',
                            inputs=checksums, model=algorithm, random_seed=seed,
                            sample_filter='Discovery ranking only; missing/invalid structures skipped',
                            validation_context='internal_test_scaffold; outside preregistered benchmark',
                            parameters={'task': TASK, 'features': FEATURES, 'model': PARAMETERS,
                                        'split': split, 'packages': packages})
    report = {'run_id': str(uuid.uuid4()), 'created_at': provenance.timestamp, 'algorithm': algorithm,
              'task': TASK, 'seed': seed, 'n_train': len(train), 'n_test': len(test),
              'n_excluded': sum(excluded.values()), 'exclusion_counts': excluded, 'split': split,
              'feature_count': 1024, 'metrics': {
                  'mae': _finite(mean_absolute_error(y[test], predicted)),
                  'baseline_mae': _finite(mean_absolute_error(y[test], baseline.predict(x[test]))),
                  'r2': _finite(r2_score(y[test], predicted)), 'spearman': _finite(correlation)},
              'training_sources': [COMPOUNDS, RANKING], 'provenance': asdict(provenance),
              'limitations': ['Exploratory chemical generalization only; no clinical interpretation.',
                              'Predicts discovery reversal scores, not independent biological evidence.',
                              'One internal scaffold split; no hyperparameter search or external validation.',
                              'Does not replace official rankings or the preregistered benchmark.',
                              'Missing covariates remain unspecified; no covariates enter this model.',
                              'Related scaffolds may remain similar across groups; salts are not standardized.',
                              'Human scientific review remains required.']}
    out = Path(data_dir) / OUTPUT
    out.mkdir(parents=True, exist_ok=True)
    predictions = frame[['pert_id', 'pert_iname', 'canonical_structure', 'group', 'consensus_median']].copy()
    predictions['split'] = 'train'
    predictions.loc[test, 'split'] = 'internal_test_scaffold'
    predictions['predicted'] = model.predict(x)
    predictions.to_parquet(out / 'predictions.parquet', index=False)
    joblib.dump(model, out / 'model.joblib')
    (out / 'modelparameters.json').write_text(json.dumps(provenance.parameters, indent=2, allow_nan=False))
    report['elapsed_seconds'] = time.monotonic() - start
    report['test_predictions'] = predictions.iloc[test].head(30)[
        ['pert_id', 'pert_iname', 'consensus_median', 'predicted']].fillna('unspecified').to_dict('records')
    (out / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False))
    for name in ['predictions.parquet', 'model.joblib', 'modelparameters.json', 'report.json']:
        provenance.write(out / name)
    return report


def predict_candidate(data_dir: Path, candidate_id: str) -> dict:
    """Return this run's stored prediction without loading pickle or external data."""
    out = Path(data_dir) / OUTPUT
    for name in ['report.json', 'predictions.parquet']:
        record = json.loads((out / (name + '.provenance.json')).read_text())
        if sha256_file(out / name) != record['output_sha256']:
            raise ValueError('Local artifact checksum mismatch')
    report = json.loads((out / 'report.json').read_text())
    rows = pd.read_parquet(out / 'predictions.parquet')
    found = rows[rows.pert_id == candidate_id]
    if found.empty:
        raise ValueError('Candidate absent from trained local artifact')
    row = found.iloc[0]
    return {'candidate_id': candidate_id, 'run_id': report['run_id'],
            'predicted': float(row.predicted), 'observed': float(row.consensus_median),
            'split': row['split'], 'task': TASK, 'limitations': report['limitations']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path.home() / 'Data/tauchstone')
    args = parser.parse_args()
    print(json.dumps(train_model(args.data_dir), indent=2, allow_nan=False))
