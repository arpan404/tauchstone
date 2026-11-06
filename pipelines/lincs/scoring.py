"""LINCS reversal scoring (WS3, Part B). Implements contracts/algorithms.md precisely.

SIGN CONVENTION (repo-wide, see AGENTS.md): query ``stat`` is AD minus control
(positive = higher in AD). Every score below is oriented so that
NEGATIVE = the drug response reverses the AD signature. All three methods are
natively positive for mimicry, so no sign flips are needed.

Notation: X = drug z matrix (n_sigs x N), N = 978 landmark genes;
y = query stat vector on the same genes; U, D = up/down query sets.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import pandas as pd

SET_SIZE = 150
MIN_SET_FDR = 10  # fewer than this in either set -> fall back to ignoring FDR
SPLIT_SEED = 20261105


@dataclass
class QuerySets:
    """Query gene sets aligned to landmark-column positions."""

    up_idx: np.ndarray  # landmark-column positions, up in AD (<= SET_SIZE)
    down_idx: np.ndarray  # landmark-column positions, down in AD (<= SET_SIZE)
    n_up: int  # selected set sizes (recorded in provenance)
    n_down: int
    up_n_fdr: int  # candidates passing fdr < 0.05 (before top-150 cut)
    down_n_fdr: int
    fdr_fallback: bool  # True if FDR filter was dropped (< MIN_SET_FDR in a set)
    query_vector: np.ndarray  # stat per landmark column (0 where gene absent)
    query_mask: np.ndarray  # bool per landmark column (gene present in query)


def build_query_sets(
    query: pd.DataFrame,
    landmark_entrez: Sequence[str],
    set_size: int = SET_SIZE,
    entrez_col: str = "entrez_id",
    stat_col: str = "stat",
    fdr_col: str = "fdr",
    p_col: str = "p_value",
) -> QuerySets:
    """Pick up/down sets within landmark genes present in the query.

    candidates_up = fdr < 0.05 and stat > 0, top ``set_size`` by stat (ties:
    smaller p_value, then entrez_id); candidates_down mirrored by -stat.
    If either set has < MIN_SET_FDR genes, fall back to top ``set_size`` by
    stat / -stat ignoring FDR and set fdr_fallback=True.
    """
    landmark = [str(e) for e in landmark_entrez]
    pos = {e: i for i, e in enumerate(landmark)}
    cols = [entrez_col, stat_col, fdr_col] + ([p_col] if p_col in query.columns else [])
    q = query[cols].copy()
    q[entrez_col] = q[entrez_col].astype(str)
    q[stat_col] = pd.to_numeric(q[stat_col], errors="coerce")
    q[fdr_col] = pd.to_numeric(q[fdr_col], errors="coerce")
    q = q[q[entrez_col].isin(pos) & q[stat_col].notna()].drop_duplicates(entrez_col)
    has_p = p_col in q.columns
    if has_p:
        q[p_col] = pd.to_numeric(q[p_col], errors="coerce").fillna(1.0)

    def top(df: pd.DataFrame, ascending: bool) -> pd.DataFrame:
        keys = [stat_col] + ([p_col] if has_p else []) + [entrez_col]
        return df.sort_values(keys, ascending=[ascending] + [True] * (len(keys) - 1)).head(set_size)

    up = q[(q[stat_col] > 0) & (q[fdr_col] < 0.05)]
    down = q[(q[stat_col] < 0) & (q[fdr_col] < 0.05)]
    up_n_fdr, down_n_fdr = len(up), len(down)
    fdr_fallback = min(up_n_fdr, down_n_fdr) < MIN_SET_FDR
    if fdr_fallback:
        up = q[q[stat_col] > 0]
        down = q[q[stat_col] < 0]
    up_idx = np.array([pos[e] for e in top(up, False)[entrez_col]], dtype=np.int64)
    down_idx = np.array([pos[e] for e in top(down, True)[entrez_col]], dtype=np.int64)

    n_land = len(landmark)
    query_vector = np.zeros(n_land)
    query_mask = np.zeros(n_land, dtype=bool)
    col = q[entrez_col].map(pos).to_numpy()
    query_vector[col] = q[stat_col].to_numpy()
    query_mask[col] = True
    return QuerySets(up_idx, down_idx, len(up_idx), len(down_idx),
                     up_n_fdr, down_n_fdr, fdr_fallback, query_vector, query_mask)


def build_query_sets_no_fdr(
    query: pd.DataFrame,
    landmark_entrez: Sequence[str],
    set_size: int = SET_SIZE,
    entrez_col: str = "entrez_id",
    stat_col: str = "stat",
    p_col: str = "p_value",
) -> QuerySets:
    """Fallback rule used for the permutation control (no fdr column needed).

    Top ``set_size`` by stat / -stat, same tie-breaks as build_query_sets.
    fdr_fallback is set True and up/down_n_fdr are -1 (not computed).
    """
    tmp = query.copy()
    tmp["__nofdr_fdr__"] = 0.0  # passes any fdr < 0.05 gate vacuously
    sets = build_query_sets(tmp, landmark_entrez, set_size, entrez_col, stat_col,
                            "__nofdr_fdr__", p_col)
    sets.fdr_fallback = True
    sets.up_n_fdr = -1
    sets.down_n_fdr = -1
    return sets


def opposite_sign_combine(es_up: np.ndarray, es_down: np.ndarray) -> np.ndarray:
    """(ES_up - ES_down)/2 if signs differ, else 0.

    sign(0) counts as different from nothing: if either ES is exactly 0 the
    result is 0.
    """
    es_up = np.asarray(es_up, dtype=np.float64)
    es_down = np.asarray(es_down, dtype=np.float64)
    opposite = (es_up > 0) & (es_down < 0) | (es_up < 0) & (es_down > 0)
    return np.where(opposite, (es_up - es_down) / 2.0, 0.0)


def es_weighted_block(
    Xb: np.ndarray, order_b: np.ndarray, S: np.ndarray, n_genes: int
) -> np.ndarray:
    """Weighted ES (p=1, Subramanian 2017 form), vectorised over a block.

    v = values in rank order; hit = membership of ranked columns in S
    (via a length-N lookup table); w = |v| * hit;
    P_hit = cumsum(w)/sum(w); P_miss = cumsum(~hit)/(N - n);
    ES = dev[argmax|dev|] (signed). sum(w) == 0 -> ES = 0.
    """
    S = np.asarray(S, dtype=np.int64)
    n = len(S)
    B = Xb.shape[0]
    if n == 0:
        return np.zeros(B)
    v = np.take_along_axis(Xb, order_b, axis=1).astype(np.float64)
    lut = np.zeros(n_genes, dtype=bool)
    lut[S] = True
    hit = lut[order_b]
    w = np.abs(v) * hit
    wsum = w.sum(axis=1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        phit = np.cumsum(w, axis=1) / wsum
    phit = np.where(wsum == 0, 0.0, phit)
    pmiss = np.cumsum(~hit, axis=1) / (n_genes - n)
    dev = phit - pmiss
    idx = np.argmax(np.abs(dev), axis=1)
    es = dev[np.arange(B), idx]
    return np.where(wsum[:, 0] == 0, 0.0, es)


def ks_lamb_block(
    rank_b: np.ndarray, S: np.ndarray, n_genes: int
) -> np.ndarray:
    """Unweighted KS (Lamb 2006 closed form), vectorised over a block.

    V = sort(rank[i, S]) + 1 (1-based tag positions), t = |S|, j = 1..t;
    a = max_j(j/t - V_j/N); b = max_j(V_j/N - (j-1)/t);
    ks_S = a if a > b else -b.
    """
    S = np.asarray(S, dtype=np.int64)
    t = len(S)
    B = rank_b.shape[0]
    if t == 0:
        return np.zeros(B)
    V = np.sort(rank_b[:, S], axis=1).astype(np.float64) + 1.0
    j = np.arange(1, t + 1)
    a = np.max(j / t - V / n_genes, axis=1)
    b = np.max(V / n_genes - (j - 1) / t, axis=1)
    return np.where(a > b, a, -b)


def cosine_block(Xb: np.ndarray, y: np.ndarray, y_norm: float, x_norms: np.ndarray) -> np.ndarray:
    """Cosine of each row of Xb with y. Zero-norm rows score 0."""
    denom = x_norms * y_norm
    with np.errstate(invalid="ignore", divide="ignore"):
        out = (Xb @ y) / denom
    return np.where(denom == 0, 0.0, out)


def standardize(x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Z-score; mu/sd computed over mask rows only (default: all rows).

    The same mu/sd applies to every row, so held-out rows can be scored on
    the ranking scale without influencing it. All-zero when sd == 0
    (sign-preserving).
    """
    x = np.asarray(x, dtype=np.float64)
    ref = x if mask is None else x[np.asarray(mask, dtype=bool)]
    mu = ref.mean() if ref.size else 0.0
    sd = ref.std() if ref.size else 0.0
    if sd == 0 or not np.isfinite(sd):
        return np.zeros_like(x)
    return (x - mu) / sd


class Scorer:
    """Score queries against a drug matrix, reusing precomputed ranks.

    Precompute once (see pipelines.lincs.ingest for the cached .npy files):
    order[i, j] = column of the j-th highest z in row i (stable argsort,
    int16); rank[i, order[i, j]] = j (0-based, int16).

    Everything runs in row blocks so peak memory stays < ~8 GB.
    """

    def __init__(self, X: np.ndarray, order: np.ndarray, rank: np.ndarray, block: int = 50_000):
        self.X = np.asarray(X)
        self.order = np.asarray(order)
        self.rank = np.asarray(rank)
        if self.X.ndim != 2 or self.order.shape != self.X.shape or self.rank.shape != self.X.shape:
            raise ValueError("X, order, rank must share shape (n_sigs, n_genes)")
        self.n_sigs, self.n_genes = self.X.shape
        self.block = int(block)

    @classmethod
    def from_landmark_matrix(cls, X: np.ndarray, block: int = 50_000) -> Scorer:
        """Build order/rank in memory (used for small/synthetic matrices)."""
        X = np.asarray(X)
        order = np.argsort(-X, axis=1, kind="stable")
        n, N = X.shape
        rank = np.empty((n, N), dtype=np.int64)
        rank[np.arange(n)[:, None], order] = np.arange(N, dtype=np.int64)[None, :]
        return cls(X, order, rank, block)

    def _iter_blocks(self):
        for start in range(0, self.n_sigs, self.block):
            yield start, min(start + self.block, self.n_sigs)

    def score_raw(self, sets: QuerySets) -> dict[str, np.ndarray]:
        """Unstandardized wtcs/ks/cosine for every signature (negative = reversal)."""
        N = self.n_genes
        wtcs = np.empty(self.n_sigs)
        ks = np.empty(self.n_sigs)
        cos = np.empty(self.n_sigs)
        y = sets.query_vector[sets.query_mask].astype(np.float64)
        y_norm = float(np.sqrt((y**2).sum()))
        mask = sets.query_mask
        for start, stop in self._iter_blocks():
            Xb = np.asarray(self.X[start:stop], dtype=np.float64)
            ob = self.order[start:stop].astype(np.int64)
            rb = self.rank[start:stop].astype(np.int64)
            es_uw = es_weighted_block(Xb, ob, sets.up_idx, N)
            es_dw = es_weighted_block(Xb, ob, sets.down_idx, N)
            wtcs[start:stop] = opposite_sign_combine(es_uw, es_dw)
            ks_u = ks_lamb_block(rb, sets.up_idx, N)
            ks_d = ks_lamb_block(rb, sets.down_idx, N)
            ks[start:stop] = opposite_sign_combine(ks_u, ks_d)
            Xm = Xb[:, mask]
            x_norms = np.sqrt((Xm**2).sum(axis=1))
            cos[start:stop] = cosine_block(Xm, y, y_norm, x_norms)
        return {"wtcs": wtcs, "ks": ks, "cosine": cos}

    def score(self, sets: QuerySets, ranking_mask: np.ndarray | None = None) -> dict[str, np.ndarray]:
        """Standardized scores + consensus (negative = reversal).

        mu/sd are computed over ranking-split rows only when ranking_mask is
        given; the same transform applies to all rows.
        """
        raw = self.score_raw(sets)
        z = {k: standardize(v, ranking_mask) for k, v in raw.items()}
        out = {**raw, "z_wtcs": z["wtcs"], "z_ks": z["ks"], "z_cosine": z["cosine"]}
        out["consensus"] = (out["z_wtcs"] + out["z_ks"] + out["z_cosine"]) / 3.0
        return out
