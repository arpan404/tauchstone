"""Warm, blockwise gold screen using the frozen ranking algorithms."""
from functools import lru_cache

import numpy as np
import pandas as pd

from pipelines.common.paths import PROCESSED
from pipelines.evidence.candidate_pool import build_pool
from pipelines.lincs.aggregate import aggregate_scores
from pipelines.lincs.rank import gold_mask, load_lincs, ranking_mask
from pipelines.lincs.scoring import Scorer, build_query_sets, standardize


@lru_cache(maxsize=1)
def warm_lincs():
    return load_lincs()


def clinical_pool(ranking):
    return build_pool(ranking, pd.read_parquet(PROCESSED / 'evidence/drug_map.parquet'))


def _signature_scores(raw, meta, mask):
    z = {f'z_{k}': standardize(v, mask) for k, v in raw.items()}
    scores = meta[['sig_id', 'pert_id', 'context_id']].copy()
    for k, v in z.items():
        scores[k] = v
    scores['consensus'] = sum(z.values()) / 3.0
    return scores


def _aggregate(raw, meta, split, mask):
    return aggregate_scores(_signature_scores(raw, meta, mask), split, sig_meta=meta)[1]


def cell_line_progress(cell_id, consensus, mask):
    """Per cell line: signatures scored so far and the most negative consensus among them.

    Read-only summary for the live view. best_consensus uses ranking rows only (held-out
    rows are counted but their scores never leave the server); NaN when a line has none.
    Sorted by n_scored descending, then cell_id.
    """
    frame = pd.DataFrame({'cell_id': np.asarray(cell_id, dtype=object),
                          'consensus': np.where(np.asarray(mask, dtype=bool), consensus, np.nan)})
    g = frame.groupby('cell_id', sort=False)['consensus']
    out = pd.DataFrame({'n_scored': g.size(), 'best_consensus': g.min()}).rename_axis('cell_id')
    return out.reset_index().sort_values(['n_scored', 'cell_id'], ascending=[False, True],
                                         ignore_index=True)


def run_screen(signature_df, on_progress, block=10000):
    """Return the full compound ranking; callbacks contain provisional clinical hits.

    on_progress(n_scored, total, top, cells) gets the provisional top 10 clinical hits
    and the per-cell-line summary from cell_line_progress for the rows scored so far.
    Partial standardisation uses only ranking rows observed so far. Final scaling
    uses every ranking gold row, exactly as rank.py --gold-only does.
    """
    data = warm_lincs()
    base = data['scorer']
    keep = np.flatnonzero(gold_mask(data['sig_info']))
    meta = data['sig_info'].iloc[keep].reset_index(drop=True)
    mask = ranking_mask(meta, data['split'], gold_only=True)
    cell_ids = meta['cell_id'].astype(str).to_numpy()
    sets = build_query_sets(signature_df, data['landmark'])
    pieces = {k: [] for k in ('wtcs', 'ks', 'cosine')}
    for start in range(0, len(keep), block):
        rows = keep[start:start + block]
        scorer = Scorer(base.X[rows], base.order[rows], base.rank[rows], block=block)
        raw = scorer.score_raw(sets)
        for k, v in raw.items():
            pieces[k].append(v)
        stop = start + len(rows)
        combined = {k: np.concatenate(v) for k, v in pieces.items()}
        scores = _signature_scores(combined, meta.iloc[:stop], mask[:stop])
        ranking = aggregate_scores(scores, data['split'], sig_meta=meta.iloc[:stop])[1]
        top = clinical_pool(ranking).head(10)
        cells = cell_line_progress(cell_ids[:stop], scores['consensus'].to_numpy(), mask[:stop])
        on_progress(stop, len(keep), top, cells)
    return _aggregate(combined, meta, data['split'], mask)
