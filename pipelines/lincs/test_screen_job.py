import numpy as np

from pipelines.lincs.screen_job import cell_line_progress


def test_cell_line_progress_counts_and_ranking_rows_only():
    cells = np.array(['A', 'B', 'A', 'C', 'A', 'B'])
    consensus = np.array([-1.0, -0.5, -3.0, -9.0, 0.2, -2.0])
    mask = np.array([True, True, False, False, True, True])
    out = cell_line_progress(cells, consensus, mask)
    assert out.cell_id.tolist() == ['A', 'B', 'C']
    assert out.n_scored.tolist() == [3, 2, 1]
    # Row A=-3.0 and C=-9.0 are held-out: counted, but never the best score.
    assert out.best_consensus.iloc[0] == -1.0
    assert out.best_consensus.iloc[1] == -2.0
    assert np.isnan(out.best_consensus.iloc[2])


def test_cell_line_progress_ties_sort_by_name():
    out = cell_line_progress(np.array(['Z', 'Y']), np.array([1.0, 2.0]), np.array([True, True]))
    assert out.cell_id.tolist() == ['Y', 'Z']
