"""Ingest unit tests (parsers) + real-data checks (spec: marked data)."""

import numpy as np
import pandas as pd
import pytest

from pipelines.lincs.ingest import canon_dose, canon_time, parse_dose, parse_time

data = pytest.mark.data


def test_parse_dose_units():
    assert parse_dose("10 uM") == (10.0, "uM")
    assert parse_dose("10.0 um") == (10.0, "uM")
    assert parse_dose("10 µM") == (10.0, "uM")
    assert parse_dose("500 nM") == (0.5, "uM")
    v, u = parse_dose("-666")
    assert u == "unspecified" and np.isnan(v)
    assert canon_dose(10.0, "uM") == "10 uM"
    assert canon_dose(0.5, "uM") == "0.5 uM"
    assert canon_dose(float("nan"), "unspecified") == "unspecified"


def test_parse_time():
    assert parse_time("24 h") == (24.0, "h")
    v, u = parse_time("-666")
    assert u == "unspecified" and np.isnan(v)
    assert canon_time(24.0, "h") == "24 h"


def _processed():
    import os
    from pathlib import Path

    return Path(os.environ.get("TS_DATA_DIR", Path.home() / "Data" / "tauchstone")) / "processed" / "lincs"


@data
def test_ingest_outputs_exist_and_align():
    d = _processed()
    for f in ["sig_info.parquet", "genes.parquet", "landmark_order.parquet",
              "level5_landmark_f32.npy", "order_i16.npy", "rank_i16.npy",
              "compounds.parquet", "context_split.parquet"]:
        assert (d / f).exists(), f
        assert (d / (f + ".provenance.json")).exists(), f + " provenance"
    sig = pd.read_parquet(d / "sig_info.parquet")
    order_info = pd.read_parquet(d / "landmark_order.parquet")
    n, n_land = len(sig), len(order_info)
    assert n_land == 978
    assert (sig["row"].to_numpy() == np.arange(n)).all()
    X = np.load(d / "level5_landmark_f32.npy", mmap_mode="r")
    assert X.shape == (n, 978) and X.dtype == np.float32 and np.isfinite(X).all()
    order = np.load(d / "order_i16.npy", mmap_mode="r")
    rank = np.load(d / "rank_i16.npy", mmap_mode="r")
    assert order.shape == (n, 978) and rank.shape == (n, 978)
    assert order.dtype == np.int16 and rank.dtype == np.int16
    # inverse-permutation property on a sample of rows
    rng = np.random.default_rng(0)
    for i in rng.choice(n, size=20, replace=False):
        assert (rank[i][order[i].astype(int)] == np.arange(978)).all()
        assert (np.sort(order[i].astype(int)) == np.arange(978)).all()
    # context ids well-formed; split values valid; trt_cp only by construction
    assert sig["context_id"].str.contains(r"\|").all()
    split = pd.read_parquet(d / "context_split.parquet")
    assert set(split["split"].unique()) <= {"ranking", "held_out"}
    assert len(split) == sig[["pert_id", "context_id"]].drop_duplicates().__len__()
    comp = pd.read_parquet(d / "compounds.parquet")
    assert (comp["n_signatures"] > 0).all()
