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


def _aggregate(raw, meta, split, mask):
    z = {f'z_{k}': standardize(v, mask) for k, v in raw.items()}
    scores = meta[['sig_id', 'pert_id', 'context_id']].copy()
    for k, v in z.items():
        scores[k] = v
    scores['consensus'] = sum(z.values()) / 3.0
    return aggregate_scores(scores, split, sig_meta=meta)[1]


def run_screen(signature_df, on_progress, block=10000):
    """Return the full compound ranking; callbacks contain provisional clinical hits.

    Partial standardisation uses only ranking rows observed so far. Final scaling
    uses every ranking gold row, exactly as rank.py --gold-only does.
    """
    data = warm_lincs()
    base = data['scorer']
    keep = np.flatnonzero(gold_mask(data['sig_info']))
    meta = data['sig_info'].iloc[keep].reset_index(drop=True)
    mask = ranking_mask(meta, data['split'], gold_only=True)
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
        ranking = _aggregate(combined, meta.iloc[:stop], data['split'], mask[:stop])
        top = clinical_pool(ranking).head(10)
        on_progress(stop, len(keep), top)
    return _aggregate(combined, meta, data['split'], mask)
