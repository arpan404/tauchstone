"""Structure model bake-off under the frozen v2 rule (preregistration_v2.yaml, structure_model).

Exploratory. Every candidate uses the served model's inputs (gold-label GSE132903 discovery
ranking, compounds.parquet), its scaffold split (GroupShuffleSplit, test_size 0.2, seed
20261105) and is scored on the same held-out compounds as the served random forest. Any tuning
or early stopping uses an inner split of the TRAINING groups only. Nothing here feeds the
ranking, any hidden test, theta, lambda, verdicts or the benchmark.

Candidates (artifacts in processed/models/v2_candidates/<name>/):
  mlp        1024 -> 512 -> 256 -> 1 network on the same 1024-bit Morgan fingerprints
  multitask  the same network with one output per cell line, trained on per-cell-line scores
             from GSE132903__main__context_scores.parquet (ranking rows of training compounds
             only); its consensus is the median over each compound's ranking contexts, as the
             pipeline computes consensus_median
  rf_desc    the served random forest class on fingerprints plus RDKit descriptors, with
             min_samples_leaf and max_features chosen on the inner split

The rule: a candidate replaces the served model only if its held-out Spearman beats the served
model's on the shared test compounds and the 95% interval of the difference (2,000 scaffold-group
bootstraps, seed 20261108) excludes zero.
"""
from __future__ import annotations

import argparse
import json
import random
import time
import uuid
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from pipelines.common.provenance import Provenance, sha256_file
from pipelines.lincs.exploratory_compare import HELD_OUT, _metrics, _paired
from pipelines.lincs.exploratory_model import FEATURES, OUTPUT, PARAMETERS, TASK, _inputs, _prepare

CANDIDATES = 'processed/models/v2_candidates'
CONTEXTS = 'processed/scores/GSE132903__main__context_scores.parquet'
SPLIT_SEED = 20261105    # outer scaffold split, identical to the served model
INNER_SEED = 20261106    # inner split of the training groups (early stopping, tuning)
TRAIN_SEED = 20261107    # network weights, dropout and batch order
BOOT_SEED = 20261108     # bootstrap of scaffold groups, fixed by the v2 rule
N_BOOT = 2000
INNER_TEST_SIZE = 0.15
NET = {'hidden': [512, 256], 'activation': 'ReLU', 'dropout': 0.3, 'optimizer': 'Adam', 'lr': 1e-3,
       'weight_decay': 1e-4, 'batch_size': 256, 'max_epochs': 300, 'patience': 20,
       'loss': 'mean squared error on standardised targets', 'early_stopping': 'inner validation loss'}
RF_GRID = {'min_samples_leaf': [1, 3, 5, 10], 'max_features': ['sqrt', 0.3, 1.0]}
DESCRIPTORS = ['MolWt', 'MolLogP', 'TPSA', 'NumRotatableBonds', 'NumHDonors', 'NumHAcceptors',
               'RingCount', 'NumAromaticRings', 'FractionCSP3', 'HeavyAtomCount']
LABELS = {'rf_served': 'Random forest', 'mlp': 'Neural network',
          'multitask': 'Neural network, one output per cell line',
          'rf_desc': 'Random forest with chemistry descriptors'}


def _seed_all(seed):
    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def _device():
    import torch
    return 'mps' if torch.backends.mps.is_available() else 'cpu'


def outer_split(frame, x):
    return next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=SPLIT_SEED).split(
        x, groups=frame['group']))


def inner_split(frame, train):
    """Split the TRAINING rows into fit and validation rows by scaffold group."""
    groups = frame['group'].to_numpy()[train]
    fit, val = next(GroupShuffleSplit(n_splits=1, test_size=INNER_TEST_SIZE, random_state=INNER_SEED)
                    .split(train, groups=groups))
    return train[fit], train[val]


def descriptors(frame):
    from rdkit import Chem
    from rdkit.Chem import Descriptors
    functions = dict(Descriptors.descList)
    rows = []
    for smiles in frame['canonical_structure']:
        mol = Chem.MolFromSmiles(smiles)
        rows.append([float(functions[name](mol)) for name in DESCRIPTORS])
    values = np.asarray(rows, dtype=float)
    return np.nan_to_num(values, nan=0.0, posinf=0.0, neginf=0.0)


def _net(n_in, n_out):
    import torch.nn as nn
    layers, width = [], n_in
    for hidden in NET['hidden']:
        layers += [nn.Linear(width, hidden), nn.ReLU(), nn.Dropout(NET['dropout'])]
        width = hidden
    return nn.Sequential(*layers, nn.Linear(width, n_out))


def fit_network(x_fit, y_fit, x_val, y_val, seed=TRAIN_SEED, device=None):
    """Train with early stopping on validation loss. y may hold NaN (masked, multi-task).

    Returns (predict function on raw features -> raw-scale targets, training log)."""
    import torch
    _seed_all(seed)
    device = device or _device()
    mean, std = np.nanmean(y_fit, axis=0), np.nanstd(y_fit, axis=0)
    std = np.where(std > 0, std, 1.0)

    def tensors(x, y):
        z = (y - mean) / std
        mask = np.isfinite(z)
        return (torch.tensor(x, dtype=torch.float32, device=device),
                torch.tensor(np.nan_to_num(z), dtype=torch.float32, device=device),
                torch.tensor(mask, dtype=torch.float32, device=device))

    xf, yf, mf = tensors(x_fit, y_fit)
    xv, yv, mv = tensors(x_val, y_val)
    model = _net(x_fit.shape[1], y_fit.shape[1]).to(device)
    optimiser = torch.optim.Adam(model.parameters(), lr=NET['lr'], weight_decay=NET['weight_decay'])
    order = torch.Generator().manual_seed(seed)

    def loss(pred, y, m):
        return ((pred - y) ** 2 * m).sum() / m.sum().clamp(min=1)

    best, best_epoch, best_state, history = np.inf, -1, None, []
    for epoch in range(NET['max_epochs']):
        model.train()
        for batch in torch.randperm(len(xf), generator=order).split(NET['batch_size']):
            batch = batch.to(device)
            optimiser.zero_grad()
            loss(model(xf[batch]), yf[batch], mf[batch]).backward()
            optimiser.step()
        model.eval()
        with torch.no_grad():
            val = float(loss(model(xv), yv, mv))
        history.append(val)
        if val < best - 1e-6:
            best, best_epoch = val, epoch
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        elif epoch - best_epoch >= NET['patience']:
            break
    model.load_state_dict(best_state)
    model.eval()

    def predict(x):
        with torch.no_grad():
            out = model(torch.tensor(x, dtype=torch.float32, device=device)).cpu().numpy()
        return out * std + mean

    log = {'device': device, 'epochs_run': len(history), 'best_epoch': best_epoch + 1,
           'best_val_loss': best, 'n_fit': int(len(x_fit)), 'n_val': int(len(x_val))}
    return predict, log, model


def cell_targets(data_dir, frame):
    """Per-compound, per-cell-line median of ranking-context scores; never held-out rows."""
    path = Path(data_dir) / CONTEXTS
    rows = pd.read_parquet(path, columns=['pert_id', 'context_id', 'split', 'cell_id', 'consensus'])
    rows = rows[(rows.split == 'ranking') & rows.pert_id.isin(set(frame.pert_id))]
    assert set(rows.split) == {'ranking'}
    check = rows.groupby('pert_id').consensus.median().reindex(frame.pert_id).to_numpy()
    if not np.allclose(check, frame.consensus_median.to_numpy()):
        raise ValueError('Context scores do not reproduce consensus_median')
    cells = sorted(rows.cell_id.unique())
    wide = (rows.groupby(['pert_id', 'cell_id']).consensus.median().unstack('cell_id')
            .reindex(index=frame.pert_id, columns=cells))
    return rows, cells, wide.to_numpy(), sha256_file(path)


def consensus_from_cells(rows, cells, frame, cell_predictions):
    """Median over each compound's ranking contexts of the predicted score for that context's
    cell line, the same aggregation that turns context scores into consensus_median."""
    col = {c: i for i, c in enumerate(cells)}
    pos = {p: i for i, p in enumerate(frame.pert_id)}
    r = rows.pert_id.map(pos).to_numpy()
    c = rows.cell_id.map(col).to_numpy()
    values = pd.Series(cell_predictions[r, c]).groupby(r).median()
    return values.reindex(range(len(frame))).to_numpy()


def _write_candidate(out, name, frame, predicted, test, report_extra, provenance, model_writer):
    out.mkdir(parents=True, exist_ok=True)
    predictions = frame[['pert_id', 'pert_iname', 'canonical_structure', 'group', 'consensus_median']].copy()
    predictions['split'] = 'train'
    predictions.loc[test, 'split'] = HELD_OUT
    predictions['predicted'] = predicted
    predictions.to_parquet(out / 'predictions.parquet', index=False)
    model_file = model_writer(out)
    (out / 'modelparameters.json').write_text(json.dumps(provenance.parameters, indent=2, allow_nan=False))
    (out / 'report.json').write_text(json.dumps(report_extra, indent=2, allow_nan=False))
    for file in ['predictions.parquet', model_file, 'modelparameters.json', 'report.json']:
        provenance.write(out / file)


def _report(name, algorithm, seed, frame, train, test, feature_count, metrics, provenance, extra):
    return {'run_id': str(uuid.uuid4()), 'created_at': provenance.timestamp, 'algorithm': algorithm,
            'name': name, 'task': TASK, 'labels': 'gold', 'preregistered': False, 'seed': seed,
            'n_train': int(len(train)), 'n_test': int(len(test)), 'n_excluded': 0,
            'split': provenance.parameters['split'], 'feature_count': feature_count,
            'metrics': {k: metrics[k] for k in ('mae', 'baseline_mae', 'r2', 'spearman')},
            'training_sources': list(provenance.inputs), 'provenance': asdict(provenance),
            'limitations': ['Exploratory bake-off candidate; not served unless it passes the v2 rule.',
                            'Predicts discovery reversal scores, not independent biological evidence.',
                            'One internal scaffold split; no external validation.',
                            'Human scientific review remains required.']} | extra


def run(data_dir: Path, only: list[str] | None = None) -> dict:
    data_dir = Path(data_dir)
    root = data_dir / CANDIDATES
    compounds, scores, checksums = _inputs(data_dir, 'gold')
    frame, x, _ = _prepare(compounds, scores)
    train, test = outer_split(frame, x)
    fit, val = inner_split(frame, train)
    assert not set(frame.group.iloc[fit]) & set(frame.group.iloc[val])
    assert not set(frame.group.iloc[train]) & set(frame.group.iloc[test])
    y = frame.consensus_median.to_numpy()

    served = pd.read_parquet(data_dir / OUTPUT / 'predictions.parquet')
    served_test = served[served.split == HELD_OUT]
    if set(served_test.pert_id) != set(frame.pert_id.iloc[test]):
        raise ValueError('Outer split does not reproduce the served model test set')
    served_pred = served.set_index('pert_id').predicted.reindex(frame.pert_id).to_numpy()

    split = {'name': 'internal_test_scaffold', 'method': 'GroupShuffleSplit', 'test_size': .2,
             'seed': SPLIT_SEED, 'inner': {'method': 'GroupShuffleSplit over training groups only',
                                           'test_size': INNER_TEST_SIZE, 'seed': INNER_SEED,
                                           'n_fit': int(len(fit)), 'n_val': int(len(val))},
             'n_train_groups': int(frame.iloc[train].group.nunique()),
             'n_test_groups': int(frame.iloc[test].group.nunique()), 'group_overlap': 0}
    packages = {p: version(p) for p in ['rdkit', 'scikit-learn', 'numpy', 'pandas', 'scipy', 'torch']}
    predictions = {'rf_served': served_pred}
    timings, details = {}, {}

    def provenance(name, algorithm, seed, params, extra_inputs=None):
        return Provenance(step=f'structure_bakeoff_{name}', dataset_accession='GSE132903',
                          inputs=checksums | (extra_inputs or {}), model=algorithm, random_seed=seed,
                          sample_filter='Discovery ranking only (gold signatures); invalid structures skipped',
                          validation_context='internal_test_scaffold; outside preregistered benchmark',
                          parameters={'task': TASK, 'labels': 'gold', 'preregistered': False,
                                      'rule': 'preregistration_v2.yaml structure_model', 'split': split,
                                      'seeds': {'split': SPLIT_SEED, 'inner': INNER_SEED,
                                                'train': TRAIN_SEED, 'bootstrap': BOOT_SEED},
                                      'packages': packages} | params)

    def finish(name, algorithm, seed, predicted, params, model_writer, extra_inputs=None, extra=None,
               feature_count=1024):
        prov = provenance(name, algorithm, seed, params, extra_inputs)
        metrics = _metrics(y[test], predicted[test], y[train].mean())
        report = _report(name, algorithm, seed, frame, train, test, feature_count, metrics, prov,
                         (extra or {}) | {'elapsed_seconds': timings[name]})
        _write_candidate(root / name, name, frame, predicted, test, report, prov, model_writer)
        predictions[name] = predicted

    def torch_writer(model, extra):
        def write(out):
            import torch
            torch.save({'state_dict': {k: v.cpu() for k, v in model.state_dict().items()}} | extra,
                       out / 'model.pt')
            return 'model.pt'
        return write

    wanted = only or ['mlp', 'multitask', 'rf_desc']
    if 'mlp' in wanted:
        start = time.monotonic()
        predict, log, model = fit_network(x[fit], y[fit, None], x[val], y[val, None])
        predicted = predict(x)[:, 0]
        timings['mlp'] = time.monotonic() - start
        details['mlp'] = log
        finish('mlp', 'pytorch_mlp', TRAIN_SEED, predicted, {'features': FEATURES, 'network': NET,
               'training': log}, torch_writer(model, {'features': FEATURES, 'network': NET}),
               extra={'training': log})

    if 'multitask' in wanted:
        start = time.monotonic()
        rows, cells, wide, sha = cell_targets(data_dir, frame)
        predict, log, model = fit_network(x[fit], wide[fit], x[val], wide[val])
        predicted = consensus_from_cells(rows, cells, frame, predict(x))
        timings['multitask'] = time.monotonic() - start
        log |= {'n_cell_lines': len(cells), 'n_fit_targets': int(np.isfinite(wide[fit]).sum())}
        details['multitask'] = log
        finish('multitask', 'pytorch_mlp_multitask', TRAIN_SEED, predicted,
               {'features': FEATURES, 'network': NET, 'training': log, 'cell_lines': cells,
                'targets': 'per compound and cell line: median ranking-context consensus; '
                           'held-out context rows never read',
                'consensus': 'median over the compound ranking contexts of the predicted score '
                             'for each context cell line'},
               torch_writer(model, {'features': FEATURES, 'network': NET, 'cell_lines': cells}),
               extra_inputs={str(data_dir / CONTEXTS): sha}, extra={'training': log})

    if 'rf_desc' in wanted:
        import joblib
        from scipy.stats import spearmanr
        from sklearn.ensemble import RandomForestRegressor
        start = time.monotonic()
        xd = np.hstack([x.astype(float), descriptors(frame)])
        search = []
        for leaf in RF_GRID['min_samples_leaf']:
            for features in RF_GRID['max_features']:
                model = RandomForestRegressor(n_estimators=PARAMETERS['n_estimators'], min_samples_leaf=leaf,
                                              max_features=features, n_jobs=-1, random_state=SPLIT_SEED)
                model.fit(xd[fit], y[fit])
                rho = float(spearmanr(y[val], model.predict(xd[val])).statistic)
                search.append({'min_samples_leaf': leaf, 'max_features': features, 'inner_val_spearman': rho})
        chosen = max(search, key=lambda s: s['inner_val_spearman'])
        model = RandomForestRegressor(n_estimators=PARAMETERS['n_estimators'],
                                      min_samples_leaf=chosen['min_samples_leaf'],
                                      max_features=chosen['max_features'], n_jobs=-1,
                                      random_state=SPLIT_SEED).fit(xd[train], y[train])
        predicted = model.predict(xd)
        timings['rf_desc'] = time.monotonic() - start
        details['rf_desc'] = {'search': search, 'chosen': chosen}

        def write(out):
            joblib.dump(model, out / 'model.joblib')
            return 'model.joblib'
        finish('rf_desc', 'random_forest_descriptors', SPLIT_SEED, predicted,
               {'features': FEATURES | {'descriptors': DESCRIPTORS}, 'grid': RF_GRID, 'search': search,
                'chosen': chosen, 'selection': 'highest inner-validation Spearman, then refit on all '
                                               'training groups; the test set was not used'},
               write, extra={'search': search, 'chosen': chosen},
               feature_count=xd.shape[1])

    return compare_all(frame, train, test, predictions, timings, details)


def compare_all(frame, train, test, predictions, timings, details):
    y = frame.consensus_median.to_numpy()
    groups = frame.group.to_numpy()[test]
    mean = y[train].mean()
    served = predictions['rf_served'][test]
    rows = []
    for name, predicted in predictions.items():
        row = {'name': name, 'label': LABELS[name]} | _metrics(y[test], predicted[test], mean)
        if name != 'rf_served':
            diff = _paired(y[test], predicted[test], served, groups, N_BOOT, BOOT_SEED)
            low = diff['spearman_ci95'][0]
            row['vs_served'] = diff
            row['passes_rule'] = bool(diff['spearman'] > 0 and low > 0)  # better and interval above zero
            row['training_seconds'] = timings.get(name)
            row['training'] = details.get(name)
        rows.append(row)
    winners = [r for r in rows if r.get('passes_rule')]
    best = max(winners, key=lambda r: r['vs_served']['spearman']) if winners else None
    served_name = best['name'] if best else 'rf_served'
    names = {r['name']: r['label'].lower() for r in rows}
    if best:
        outcome = (f'The {names[served_name]} beat the random forest on structures it had not seen, '
                   'so it is now used.')
    else:
        outcome = ('None of the new models beat the random forest on structures they had not seen, '
                   'so the random forest is still used.')
    return {'preregistered': False, 'rule': 'preregistration_v2.yaml structure_model replacement_rule',
            'test_set': {'name': HELD_OUT, 'n_compounds': int(len(test)),
                         'n_groups': int(len(set(groups))), 'split_seed': SPLIT_SEED},
            'bootstrap': {'unit': 'scaffold group', 'n': N_BOOT, 'seed': BOOT_SEED},
            'models': rows, 'served': served_name, 'outcome': outcome}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path.home() / 'Data/tauchstone')
    parser.add_argument('--only', nargs='*', choices=['mlp', 'multitask', 'rf_desc'])
    args = parser.parse_args()
    result = run(args.data_dir, args.only)
    target = args.data_dir / CANDIDATES / 'comparison.json'
    target.write_text(json.dumps(result, indent=2, allow_nan=False))
    inputs = {str(p): sha256_file(p) for p in sorted((args.data_dir / CANDIDATES).glob('*/predictions.parquet'))}
    served = args.data_dir / OUTPUT / 'predictions.parquet'
    inputs[str(served)] = sha256_file(served)
    Provenance(step='structure_bakeoff_comparison', dataset_accession='GSE132903', inputs=inputs,
               random_seed=BOOT_SEED, validation_context='internal_test_scaffold; outside preregistered benchmark',
               parameters={'preregistered': False, 'bootstrap_unit': 'scaffold group', 'n_boot': N_BOOT,
                           'rule': 'preregistration_v2.yaml structure_model'}).write(target)
    print(json.dumps({k: v for k, v in result.items() if k != 'models'}, indent=2))
    for r in result['models']:
        print(r['name'], round(r['mae'], 4), round(r['baseline_mae'], 4), round(r['r2'] or 0, 4),
              round(r['spearman'], 4), r.get('vs_served', {}).get('spearman_ci95'), r.get('passes_rule'),
              r.get('training_seconds'))


if __name__ == '__main__':
    main()
