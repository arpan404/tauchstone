"""Compare two exploratory structure models (gold labels vs all-signature labels).

Exploratory, not preregistered. Reads only the two runs' predictions.parquet files; nothing
here feeds ranking, thresholds, candidate choice or any hidden test.

The two runs split different compound sets, so their own test numbers are not like for like.
The fair comparison is on compounds held out by BOTH runs (scaffold groups unseen by both
models), scored against each label set in turn. Noise is a paired bootstrap over scaffold groups.

That shared set is small, so matched_gold_test adds one evaluation-only check: an all-label
model trained with every gold-test scaffold group removed, scored on the gold run's full test
set against the gold labels. That model is not saved or served.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from pipelines.common.provenance import Provenance, sha256_file
from pipelines.lincs.exploratory_model import LABELS

CANDIDATES = 'processed/models/exploratory_candidates'
HELD_OUT = 'internal_test_scaffold'


def _metrics(y, predicted, baseline):
    mae = float(np.mean(np.abs(y - predicted)))
    base = float(np.mean(np.abs(y - baseline)))
    ss_res, ss_tot = float(np.sum((y - predicted) ** 2)), float(np.sum((y - np.mean(y)) ** 2))
    return {'n': int(len(y)), 'mae': mae, 'baseline_mae': base, 'mae_gain_vs_baseline': base - mae,
            'r2': 1 - ss_res / ss_tot if ss_tot else None,
            'spearman': float(spearmanr(y, predicted).statistic)}


def _own(frame):
    train, test = frame[frame.split != HELD_OUT], frame[frame.split == HELD_OUT]
    y = test.consensus_median.to_numpy()
    return _metrics(y, test.predicted.to_numpy(), train.consensus_median.mean()) | {
        'n_train': int(len(train)), 'n_test': int(len(test))}


def _paired(y, a, b, groups, n_boot, seed):
    """Point estimate and scaffold-group bootstrap CI for (model a) minus (model b)."""
    rng = np.random.default_rng(seed)
    unique, index = np.unique(groups, return_inverse=True)
    members = [np.flatnonzero(index == g) for g in range(len(unique))]
    diff_mae, diff_rho = [], []
    for _ in range(n_boot):
        i = np.concatenate([members[g] for g in rng.integers(0, len(unique), len(unique))])
        diff_mae.append(np.mean(np.abs(y[i] - a[i])) - np.mean(np.abs(y[i] - b[i])))
        diff_rho.append(spearmanr(y[i], a[i]).statistic - spearmanr(y[i], b[i]).statistic)
    return {'mae': float(np.mean(np.abs(y - a)) - np.mean(np.abs(y - b))),
            'mae_ci95': [float(v) for v in np.percentile(diff_mae, [2.5, 97.5])],
            'spearman': float(spearmanr(y, a).statistic - spearmanr(y, b).statistic),
            'spearman_ci95': [float(v) for v in np.percentile(diff_rho, [2.5, 97.5])]}


def matched_gold_test(data_dir: Path, gold: pd.DataFrame, n_boot=2000, seed=20261105) -> dict:
    """All-label model refit without any gold-test scaffold group, scored on the gold test set."""
    from sklearn.ensemble import RandomForestRegressor

    from pipelines.lincs.exploratory_model import PARAMETERS, _inputs, _prepare

    frame, x, _ = _prepare(*_inputs(data_dir, 'all')[:2])
    test = gold[gold.split == HELD_OUT]
    keep = ~frame.group.isin(set(test.group)).to_numpy()
    model = RandomForestRegressor(**PARAMETERS, random_state=seed).fit(
        x[keep], frame.consensus_median.to_numpy()[keep])
    lookup = dict(zip(frame.pert_id, range(len(frame)), strict=True))
    rows = [lookup.get(p) for p in test.pert_id]
    present = np.array([r is not None for r in rows])
    test = test[present]
    a = model.predict(x[[r for r in rows if r is not None]])
    y, b = test.consensus_median.to_numpy(), test.predicted.to_numpy()
    mean_all = frame.consensus_median.to_numpy()[keep].mean()
    mean_gold = gold[gold.split != HELD_OUT].consensus_median.mean()
    return {'description': 'all-label model refit excluding every gold-test scaffold group; '
                           'scored on the gold test set against gold labels; not saved or served',
            'n_train': int(keep.sum()), 'n_test': int(len(test)),
            'n_gold_test_without_all_label': int((~present).sum()),
            'gold_model': _metrics(y, b, mean_gold), 'all_model': _metrics(y, a, mean_all),
            'all_minus_gold': _paired(y, a, b, test.group.to_numpy(), n_boot, seed)}


def compare(gold: pd.DataFrame, allsig: pd.DataFrame, n_boot=2000, seed=20261105) -> dict:
    """Own-test metrics for each run, then like-for-like metrics on the shared held-out set."""
    means = {'gold': gold[gold.split != HELD_OUT].consensus_median.mean(),
             'all': allsig[allsig.split != HELD_OUT].consensus_median.mean()}
    both = gold[gold.split == HELD_OUT].merge(
        allsig[allsig.split == HELD_OUT], on='pert_id', suffixes=('_gold', '_all'), validate='one_to_one')
    if (both.group_gold != both.group_all).any():
        raise ValueError('Scaffold grouping differs between runs')
    groups = both.group_gold.to_numpy()
    out = {'own_test': {'gold': _own(gold), 'all': _own(allsig)},
           'shared_test': {'n_compounds': int(len(both)), 'n_groups': int(len(set(groups)))},
           'bootstrap': {'unit': 'scaffold group', 'n': n_boot, 'seed': seed}}
    for target in ('gold', 'all'):
        y = both[f'consensus_median_{target}'].to_numpy()
        pred = {m: both[f'predicted_{m}'].to_numpy() for m in ('gold', 'all')}
        scored = {f'{m}_model': _metrics(y, pred[m], means[m]) for m in ('gold', 'all')}
        scored['all_minus_gold'] = _paired(y, pred['all'], pred['gold'], groups, n_boot, seed)
        out['shared_test'][f'{target}_labels'] = scored
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path.home() / 'Data/tauchstone')
    args = parser.parse_args()
    root = args.data_dir / CANDIDATES
    paths = {k: root / k / 'predictions.parquet' for k in ('gold', 'all')}
    frames = {k: pd.read_parquet(p) for k, p in paths.items()}
    result = compare(frames['gold'], frames['all'])
    result['matched_gold_test'] = matched_gold_test(args.data_dir, frames['gold'])
    result['preregistered'] = False
    target = root / 'comparison.json'
    target.write_text(json.dumps(result, indent=2, allow_nan=False))
    Provenance(step='exploratory_structure_model_comparison', dataset_accession='GSE132903',
               inputs={str(p): sha256_file(p) for p in [*paths.values(), *(args.data_dir / LABELS[k] for k in LABELS)]},
               random_seed=20261105,
               validation_context='internal scaffold test sets of both runs; outside preregistered benchmark',
               parameters={'preregistered': False, 'bootstrap_unit': 'scaffold group',
                           'n_boot': 2000}).write(target)
    print(json.dumps(result, indent=2))
