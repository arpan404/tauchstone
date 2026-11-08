"""Structure model bake-off: rule applied mechanically, consensus aggregation, no test leakage."""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from pipelines.common.provenance import sha256_file
from pipelines.lincs.structure_bakeoff import (
    BOOT_SEED,
    CANDIDATES,
    N_BOOT,
    compare_all,
    consensus_from_cells,
    inner_split,
)

DATA = Path(os.environ.get('TS_DATA_DIR', Path.home() / 'Data/tauchstone'))


def _frame(n=60):
    rng = np.random.default_rng(0)
    y = rng.normal(size=n)
    return pd.DataFrame({'pert_id': [f'p{i}' for i in range(n)], 'group': [f'g{i // 2}' for i in range(n)],
                         'consensus_median': y}), y, rng


def test_inner_split_stays_inside_training_groups():
    frame, _, _ = _frame()
    train, test = np.arange(0, 48), np.arange(48, 60)
    fit, val = inner_split(frame, train)
    assert set(fit) | set(val) == set(train)
    assert not (set(fit) | set(val)) & set(test)
    assert not set(frame.group.iloc[fit]) & set(frame.group.iloc[val])


def test_consensus_is_median_over_each_compound_contexts():
    frame = pd.DataFrame({'pert_id': ['a', 'b']})
    rows = pd.DataFrame({'pert_id': ['a', 'a', 'a', 'b'], 'cell_id': ['X', 'X', 'Y', 'Y']})
    cell_predictions = np.array([[1.0, 4.0], [0.0, -2.0]])
    # a: contexts X, X, Y -> median(1, 1, 4) = 1; b: context Y -> -2
    assert consensus_from_cells(rows, ['X', 'Y'], frame, cell_predictions).tolist() == [1.0, -2.0]


def test_rule_needs_interval_above_zero():
    frame, y, rng = _frame(400)
    frame['group'] = [f'g{i}' for i in range(400)]
    train, test = np.arange(0, 200), np.arange(200, 400)
    noise = rng.normal(size=400)
    predictions = {'rf_served': noise, 'mlp': y + 0.3 * noise, 'multitask': noise + 1e-9}
    out = compare_all(frame, train, test, predictions, {}, {})
    rows = {r['name']: r for r in out['models']}
    assert rows['mlp']['passes_rule'] and rows['mlp']['vs_served']['spearman_ci95'][0] > 0
    assert not rows['multitask']['passes_rule']
    assert out['served'] == 'mlp' and out['bootstrap'] == {'unit': 'scaffold group', 'n': N_BOOT, 'seed': BOOT_SEED}
    out = compare_all(frame, train, test, {'rf_served': noise, 'mlp': noise[::-1].copy()}, {}, {})
    assert out['served'] == 'rf_served' and 'still used' in out['outcome']


@pytest.mark.data
def test_stored_comparison_matches_rule_and_served_model():
    path = DATA / CANDIDATES / 'comparison.json'
    if not path.exists():
        pytest.skip('bake-off not run')
    result = json.loads(path.read_text())
    record = json.loads(path.with_name('comparison.json.provenance.json').read_text())
    assert record['output_sha256'] == sha256_file(path)
    assert result['bootstrap']['seed'] == 20261108 and result['bootstrap']['n'] == 2000
    assert result['test_set']['split_seed'] == 20261105
    for row in result['models'][1:]:
        low = row['vs_served']['spearman_ci95'][0]
        assert row['passes_rule'] == (row['vs_served']['spearman'] > 0 and low > 0)
    if not any(r.get('passes_rule') for r in result['models']):
        assert result['served'] == 'rf_served'
    served = json.loads((DATA / 'processed/models/exploratory/report.json').read_text())
    assert served['algorithm'] == 'random_forest'
    assert abs(served['metrics']['spearman'] - result['models'][0]['spearman']) < 1e-9
