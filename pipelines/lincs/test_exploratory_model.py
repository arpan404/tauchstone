"""Local synthetic checks for the isolated exploratory training path."""
import json
from pathlib import Path

import pandas as pd
import pytest

from pipelines.common.provenance import Provenance, sha256_file
from pipelines.lincs.exploratory_model import COMPOUNDS, OUTPUT, RANKING, predict_candidate, train_model


def fixture_data(root):
    smiles = ['CCO', 'OCC', 'CCC', 'CCCC', 'CCN', 'CCCl', 'CCBr', 'CCF', 'CCCO', 'CCCCO',
              'c1ccccc1', 'Cc1ccccc1', 'c1ccncc1', 'C1CCCCC1', None, 'invalid']
    ids = [f'c{i}' for i in range(len(smiles))]
    compounds = root / COMPOUNDS
    ranking = root / RANKING
    compounds.parent.mkdir(parents=True)
    ranking.parent.mkdir(parents=True)
    pd.DataFrame({'pert_id': ids, 'pert_iname': ids, 'canonical_smiles': smiles}).to_parquet(compounds)
    pd.DataFrame({'pert_id': ids, 'consensus_median': [i / 10 for i in range(len(ids))]}).to_parquet(ranking)
    Provenance(step='lincs_rank_compounds', dataset_accession='synthetic', parameters={
        'standardisation': 'ranking-contexts-only', 'signature': 'GSE132903__main.parquet',
        'gold_only': True, 'permutation_rule_for_real': True}).write(ranking)


def test_training_split_provenance_and_allowlist(tmp_path, monkeypatch):
    fixture_data(tmp_path)
    original = pd.read_parquet
    reads = []

    def guarded(path, *args, **kwargs):
        reads.append(Path(path))
        assert Path(path) in [tmp_path / COMPOUNDS, tmp_path / RANKING]
        return original(path, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(pd, 'read_parquet', guarded)
        first = train_model(tmp_path)
        second = train_model(tmp_path)
    assert set(reads) == {tmp_path / COMPOUNDS, tmp_path / RANKING}
    assert first['metrics'] == second['metrics']
    assert first['n_excluded'] == 2
    assert first['split']['group_overlap'] == 0
    rows = original(tmp_path / OUTPUT / 'predictions.parquet')
    assert rows.groupby('canonical_structure')['split'].nunique().max() == 1
    assert rows.groupby('group')['split'].nunique().max() == 1
    for name in ['report.json', 'model.joblib', 'predictions.parquet', 'modelparameters.json']:
        path = tmp_path / OUTPUT / name
        provenance = json.loads(path.with_name(name + '.provenance.json').read_text())
        assert provenance['output_sha256'] == sha256_file(path)
        assert provenance['random_seed'] == 20261105
        assert len(provenance['inputs']) == 3
    assert predict_candidate(tmp_path, 'c0')['run_id'] == second['run_id']
    with pytest.raises(ValueError, match='absent'):
        predict_candidate(tmp_path, 'unknown')


def test_rejects_modified_discovery_provenance(tmp_path):
    fixture_data(tmp_path)
    path = tmp_path / RANKING
    sidecar = path.with_name(path.name + '.provenance.json')
    record = json.loads(sidecar.read_text())
    record['parameters']['standardisation'] = 'all-contexts'
    sidecar.write_text(json.dumps(record))
    with pytest.raises(ValueError, match='provenance'):
        train_model(tmp_path)
    assert not (tmp_path / OUTPUT).exists()


@pytest.mark.data
def test_real_discovery_input_metadata():
    import os

    from pipelines.lincs.exploratory_model import _inputs
    root = Path(os.environ.get('TS_DATA_DIR', Path.home() / 'Data/tauchstone'))
    if not (root / RANKING).exists():
        pytest.skip('Discovery data unavailable')
    _, scores, _ = _inputs(root)
    assert len(scores) == 5690
