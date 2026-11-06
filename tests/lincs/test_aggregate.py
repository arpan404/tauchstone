"""Unit tests for pipelines.lincs.aggregate (spec 9). Synthetic, fast."""

import numpy as np
import pandas as pd

from pipelines.lincs.aggregate import (
    aggregate_scores,
    make_context_split,
    n_held_out,
)


def _sig_info(n_perts=6, ctx_per_pert=10, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for p in range(n_perts):
        for c in range(ctx_per_pert):
            for s in range(rng.integers(1, 4)):
                rows.append((f"BRD-{p}", f"CELL|{c} uM|24 h", f"s{p}_{c}_{s}"))
    return pd.DataFrame(rows, columns=["pert_id", "context_id", "sig_id"])


def test_split_deterministic_and_formula():
    si = _sig_info()
    a = make_context_split(si, seed=20261105)
    b = make_context_split(si, seed=20261105)
    pd.testing.assert_frame_equal(a, b)
    for _pert, grp in a.groupby("pert_id"):
        n = grp["context_id"].nunique()
        held = (grp["split"] == "held_out").sum()
        assert held == n_held_out(n)
        assert (grp["split"] == "ranking").sum() >= 3


def test_split_respects_min_three_ranking_contexts():
    rows = [(f"P{i}", f"CELL|{d} uM|24 h", f"s{i}_{d}") for i in range(3) for d in range(4)]
    si = pd.DataFrame(rows, columns=["pert_id", "context_id", "sig_id"])
    split = make_context_split(si)
    assert (split["split"] == "ranking").sum() == 12 - 3  # n=4 -> held = min(1, 1) = 1
    rows2 = [(f"Q{i}", f"CELL|{d} uM|24 h", f"t{i}_{d}") for i in range(2) for d in range(2)]
    si2 = pd.DataFrame(rows2, columns=["pert_id", "context_id", "sig_id"])
    split2 = make_context_split(si2)
    assert (split2["split"] == "held_out").sum() == 0  # n=2 -> held = max(0, min(0, -1)) = 0


def _scored(si, seed=1):
    rng = np.random.default_rng(seed)
    df = si.copy()
    df["consensus"] = rng.normal(size=len(df))
    for c in ("z_wtcs", "z_ks", "z_cosine"):
        df[c] = rng.normal(size=len(df))
    return df


def test_aggregation_excludes_held_out_contexts():
    si = _sig_info(n_perts=4, ctx_per_pert=10)
    split = make_context_split(si)
    scored = _scored(si)
    _, comp1 = aggregate_scores(scored, split, sig_meta=si.assign(
        cell_id="CELL", pert_idose="1 uM", pert_itime="24 h"))
    held_pairs = set(zip(split.loc[split["split"] == "held_out", "pert_id"],
                         split.loc[split["split"] == "held_out", "context_id"], strict=True))
    assert len(held_pairs) > 0
    scored2 = scored.copy()
    is_held = pd.Series(list(zip(scored2["pert_id"], scored2["context_id"], strict=True))).isin(held_pairs)
    scored2.loc[is_held.to_numpy(), "consensus"] = 1e6  # corrupt every held-out score
    _, comp2 = aggregate_scores(scored2, split, sig_meta=si.assign(
        cell_id="CELL", pert_idose="1 uM", pert_itime="24 h"))
    pd.testing.assert_frame_equal(comp1, comp2)  # leakage: held-out must not matter


def test_compounds_with_few_ranking_contexts_excluded():
    # make_context_split always keeps >= 3 ranking contexts, so hand-roll a
    # split where P1 has only 2 ranking contexts.
    si = pd.DataFrame([
        ("P1", "A", "s1"), ("P1", "B", "s2"), ("P1", "C", "s3"),
        ("P2", "A", "t1"), ("P2", "B", "t2"), ("P2", "C", "t3"),
    ], columns=["pert_id", "context_id", "sig_id"])
    split = pd.DataFrame([
        ("P1", "A", "ranking"), ("P1", "B", "ranking"), ("P1", "C", "held_out"),
        ("P2", "A", "ranking"), ("P2", "B", "ranking"), ("P2", "C", "ranking"),
    ], columns=["pert_id", "context_id", "split"])
    scored = si.copy()
    scored[["consensus", "z_wtcs", "z_ks", "z_cosine"]] = 0.0
    _, comp = aggregate_scores(scored, split)
    assert "P1" not in set(comp["pert_id"])
    assert "P2" in set(comp["pert_id"])


def test_context_means_and_compound_medians_by_hand():
    split = pd.DataFrame([
        ("P", "A", "ranking"), ("P", "B", "ranking"), ("P", "C", "ranking"), ("P", "D", "held_out"),
    ], columns=["pert_id", "context_id", "split"])
    scored = pd.DataFrame({
        "sig_id": ["s1", "s2", "s3", "s4", "s5"], "pert_id": "P",
        "context_id": ["A", "A", "B", "C", "D"],
        "consensus": [1.0, 3.0, 10.0, 20.0, 1000.0],
        "z_wtcs": [1.0, 3.0, 10.0, 20.0, 1000.0],
        "z_ks": [1.0, 3.0, 10.0, 20.0, 1000.0],
        "z_cosine": [1.0, 3.0, 10.0, 20.0, 1000.0]})
    ctx, comp = aggregate_scores(scored, split)
    assert ctx.loc[ctx["context_id"] == "A", "consensus"].iloc[0] == 2.0
    row = comp.iloc[0]
    assert row["consensus_median"] == 10.0  # median(2, 10, 20), held-out D ignored
    assert row["n_ranking_contexts"] == 3
    assert len(comp) == 1 and comp["rank"].iloc[0] == 1
