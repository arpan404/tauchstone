# LINCS 2020 beta: post-expo source

**This source is not part of the preregistered analysis and changes no frozen artifact.** It
feeds no signature, ranking, threshold θ, λ, demo candidate, truth table or benchmark. Nothing
in `data/manifests/preregistration.yaml` refers to it. Its outputs go to
`$TS_DATA_DIR/processed/lincs2020/`, a separate folder from the frozen `processed/lincs/`, and
the ingest refuses to write into `processed/lincs/`.

## What it is

The CMap LINCS 2020 beta release (December 2020) from the Broad Institute: about 3M L1000
profiles and 1,201,944 Level 5 (replicate-collapsed) signatures across all perturbation types,
on 12,328 genes (978 measured landmarks). It is a superset of the two releases used for the expo
(GSE92742, GSE70138): 290,925 of the 312,438 frozen compound signature IDs reappear in it.

clue.io was retired on 31 Jan 2026. The release files are still served from the Broad's public
S3 bucket, with no account or key. There is no GEO series for this release (GEO search for
"CMap LINCS 2020" returns only unrelated series).

## Files (HEAD-checked 2026-11-08)

Base URL: `https://s3.amazonaws.com/macchiato.clue.io/builds/LINCS2020/`.

Group `lincs/LINCS2020` (downloaded, 36.7 GB):

| File | Bytes |
|---|---|
| `level5/level5_beta_trt_cp_n720216x12328.gctx` (compounds) | 35,518,405,386 |
| `siginfo_beta.txt` | 465,242,319 |
| `geneinfo_beta.txt` | 1,141,389 |
| `compoundinfo_beta.txt` | 4,631,014 |
| `cellinfo_beta.txt` | 37,979 |
| `README.txt` | 2,200 |
| `LINCS2020 Release Metadata Field Definitions.xlsx` (saved with underscores) | 40,461 |

Group `lincs/LINCS2020_other` (listed, not downloaded, 23.2 GB): Level 5 `ctl` (2,861,439,555),
`trt_sh` (11,754,477,623), `trt_oe` (1,685,209,064), `trt_xpr` (6,516,812,529), `trt_misc`
(408,533,814). The single file `level5/level5_beta_all_n1201944x12328.gctx` (53,711,813,315
bytes) holds the same signatures as both groups together. `instinfo_beta.txt` (674,838,120
bytes, Level 3/4 metadata) is not listed; the Level 5 ingest doesn't need it.

Checksums: the bucket publishes no checksum file (`md5sums.txt`, `checksums.txt`, `MD5SUMS`
return 403, and the bucket listing is forbidden). The fetcher records SHA-256 in
`data/manifests/checksums.json` as usual. To check the downloads against the server's S3
multipart ETags, run `uv run python -m pipelines.lincs.lincs2020 verify`.

## Fetching

Both groups are `tier = "stretch"` and `opt_in = true`. Opt-in groups are skipped by
`make data` (`--tier all`), by `--tier core` and by every other tier. They are fetched only when
named:

```sh
python3 scripts/fetch_data.py --group lincs/LINCS2020 --tier all --dry-run   # list only
python3 scripts/fetch_data.py --group lincs/LINCS2020 --tier all             # download (resumable)
```

Files land in `$TS_DATA_DIR/raw/lincs/LINCS2020/`. Interrupted downloads resume (aria2c `-c`).
Check `df -h ~/Data` first: the compound group needs 36.7 GB, both groups 60 GB.

## Ingest

`pipelines/lincs/lincs2020.py` reads the 2020 files into the 2017 shapes (`sig_info`,
`genes`, `landmark_order`, `compounds`, and the float32 landmark matrix). Its module docstring
lists the frozen-schema notes. The main ones:

- 2020 column renames are mapped back to the frozen names (`cmap_name` → `pert_iname`,
  `cell_iname` → `cell_id`, `cc_q75` → `distil_cc_q75`, `nsample` → `distil_nsample`).
- nM doses are converted to uM. Other units (`ug/ml` and `%`, 84 signatures) are kept as given.
  Missing doses (102 signatures) are `unspecified`, never imputed.
- `frozen_split` tags each row `ranking`, `held_out` or `not_in_frozen_split`, using the frozen
  2017 context split. Because the 2020 data re-contains the held-out contexts, anything built
  on it must drop `held_out` rows or be labelled exploratory. On the real metadata the tag gives
  236,265 ranking, 91,033 held_out and 392,918 not_in_frozen_split signatures.

```sh
uv run python -m pipelines.lincs.lincs2020 metadata   # tables, about a minute
uv run python -m pipelines.lincs.lincs2020 matrix     # 720,216 x 978 float32, about 2.8 GB
```

Neither step has been run into `processed/`. Nothing is rescored, reranked or retrained.

## Licence and terms (needs a human decision)

The terms could not be confirmed. The clue.io terms PDF
(`assets.clue.io/resources/CLUE_Software_License_T_and_C.pdf`) now holds only the retirement
notice ("All publicly available data will still be accessible at GEO"). The archived clue.io
pages say that "Access Keys, Code, and Data Files" are "for research use only", "restricted to
academic use within not-for-profit institutions", and must not be redistributed. NIH LINCS data
are generally released publicly. Before using this data in any public output, or sharing
derived files, someone needs to confirm which terms cover the S3 release.
