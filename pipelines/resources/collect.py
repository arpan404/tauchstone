"""Build report-only agreement. Run with python -m pipelines.resources.collect."""

from __future__ import annotations

import argparse
import json
import os
import tarfile
from pathlib import Path

import httpx
import pandas as pd
from scipy.stats import spearmanr

from pipelines.common.paths import DATA_DIR
from pipelines.common.provenance import Provenance, sha256_file
from pipelines.lincs.scoring import build_query_sets
from pipelines.resources import clue, perturbseqr
from pipelines.resources.cache import Cache, now
from pipelines.resources.perturbseqr import normalize_name

LABEL = "not preregistered; report-only"
COLUMNS = ["pert_id", "resource", "status", "rank", "n_ranked", "score", "fetched_at", "source_url", "note"]


def load_query(processed: Path) -> tuple[dict, dict[str, str]]:
    paths = {
        name: processed / name
        for name in (
            "signatures/GSE132903__main.parquet",
            "lincs/landmark_order.parquet",
            "lincs/genes.parquet",
            "scores/GSE132903__main__candidate_pool.parquet",
        )
    }
    signature = pd.read_parquet(paths["signatures/GSE132903__main.parquet"])
    signs = {}
    for symbol, expected in (("GFAP", 1), ("SST", -1), ("VGF", -1)):
        values = signature.loc[signature.symbol == symbol, "stat"]
        if len(values) != 1 or not float(values.iloc[0]) * expected > 0:
            raise ValueError(f"AD-minus-control direction check failed: {symbol}")
        signs[symbol] = float(values.iloc[0])
    order = pd.read_parquet(paths["lincs/landmark_order.parquet"]).sort_values("col")
    entrez = order.entrez_id.astype(str).tolist()
    genes = pd.read_parquet(paths["lincs/genes.parquet"])
    genes["entrez_id"] = genes.entrez_id.astype(str)
    symbols = genes.set_index("entrez_id").symbol
    sets = build_query_sets(signature, entrez)
    result = {"label": LABEL, "cohort": "GSE132903", "sign_checks": signs, "fdr_fallback": sets.fdr_fallback}
    for label, indexes in (("up", sets.up_idx), ("down", sets.down_idx)):
        ids = [entrez[i] for i in indexes]
        names = [symbols.loc[gene] for gene in ids]
        if any(not isinstance(name, str) or not name.strip() for name in names):
            raise ValueError("Missing landmark gene symbols")
        if len(set(names)) != len(names):
            raise ValueError("Ambiguous duplicate landmark symbols")
        result[label] = names
        result[label + "_entrez"] = ids
    return result, {str(path): sha256_file(path) for path in paths.values()}


def agreement_rows(
    pool: pd.DataFrame,
    ranked: list[dict],
    resource: str,
    fetched_at: str | None,
    source_url: str,
    *,
    status: str = "available",
    note: str = "",
) -> list[dict]:
    """Restrict comparison to the fixed pool top 100; never reorder the pool."""
    lookup = {r["name"]: r for r in ranked}
    owners: dict[str, set[str]] = {}
    aliases: dict[str, set[str]] = {}
    for row in pool.to_dict("records"):
        names = {
            normalize_name(row[key])
            for key in ("pert_iname", "drug_name", "pert_id")
            if pd.notna(row.get(key)) and str(row[key]).strip()
        }
        aliases[row["pert_id"]] = names
        for name in names:
            owners.setdefault(name, set()).add(normalize_name(row["pert_iname"]))
    output = []
    for row in pool.sort_values("pool_rank").head(100).to_dict("records"):
        record = dict.fromkeys(COLUMNS)
        record.update(
            pert_id=row["pert_id"],
            resource=resource,
            status=status,
            fetched_at=fetched_at,
            source_url=source_url,
            note=f"{LABEL}. {note}".strip(),
        )
        if status == "available":
            names = aliases[row["pert_id"]]
            # Prefer the actual LINCS perturbation name, then a direct ID. Curated
            # aliases are fallback only; repeated pert_ids for the same name are valid.
            primary = normalize_name(row["pert_iname"])
            direct_id = normalize_name(row["pert_id"])
            preferred = primary if primary in lookup else direct_id if direct_id in lookup else None
            matches = {preferred} if preferred else {
                name for name in names if name in lookup and len(owners[name]) == 1
            }
            record["n_ranked"] = len(ranked)
            if len(matches) == 1:
                match = lookup[next(iter(matches))]
                record.update(rank=match["rank"], score=match["score"])
                record["note"] += f" Matched {match['name']}; libraries: {', '.join(match['libraries'])}."
            elif len(matches) > 1 or any(name in lookup and len(owners[name]) > 1 for name in names):
                record.update(
                    status="not_available", note=f"{LABEL}. Ambiguous normalized-name match; no score assigned."
                )
            else:
                record.update(status="not_found")
                record["note"] += " No unambiguous name match in returned query universe."
        output.append(record)
    return output


def correlation(pool: pd.DataFrame, frame: pd.DataFrame, resource: str) -> dict:
    overlap = frame[(frame.resource == resource) & (frame.status == "available")].merge(
        pool[["pert_id", "consensus_median"]], on="pert_id", validate="one_to_one"
    )
    overlap = overlap.dropna(subset=["score", "consensus_median"])
    n = len(overlap)
    if n < 3 or overlap.score.nunique() < 2 or overlap.consensus_median.nunique() < 2:
        return {"n": n, "rho": None, "pvalue": None}
    rho, pvalue = spearmanr(overlap.consensus_median, overlap.score)
    return {"n": n, "rho": float(rho), "pvalue": float(pvalue)}


def write_report(
    path: Path, query: dict, pool: pd.DataFrame, frame: pd.DataFrame, provenance: Provenance, caches: dict
) -> None:
    lines = [
        "# Cross-resource agreement",
        "",
        f"Generated {now()}. {LABEL}.",
        "",
        "GSE132903 alone supplies the AD-minus-control query. No held-out cohort, composition-adjusted "
        "signature, exposure lookup, truth table or benchmark output is read. These results never feed "
        "ranking, thresholds, tuning, candidate selection or the benchmark.",
        "",
        f"`build_query_sets` selected {len(query['up'])} up and {len(query['down'])} down landmark genes; "
        f"FDR fallback: {query['fdr_fallback']}. Symbols come from `lincs/genes.parquet` after alignment "
        "by string Entrez ID to `landmark_order.parquet`. Direction checks: "
        + "; ".join(f"{k} stat={v:.6f}" for k, v in query["sign_checks"].items())
        + ".",
        "",
        "The comparison set is the existing candidate pool sorted by `pool_rank`, first 100 rows. "
        f"The full pool contains {len(pool)} compounds. The local row reports pool rank and consensus median.",
        "",
        "## Access and method",
        "",
        "Perturb-Seqr was discovered through its homepage's [llms.txt](https://perturbseqr.maayanlab.cloud/llms.txt), "
        "[published query examples]("
        "https://raw.githubusercontent.com/MaayanLab/maayan-lab-tools-skills/main/skills/Perturb-Seqr/SKILL.md), "
        "and [current paired-search source]("
        "https://github.com/MaayanLab/PerturbSeqr/blob/main/mcp/src/tools/PairedGeneSetSearchTool.ts). "
        "POST JSON to `https://perturbseqr.maayanlab.cloud/graphql`, operation `PairEnrichmentQuery`, "
        "field `currentBackground.pairedEnrich`. Disease up is genesUp and disease down is genesDown; "
        "pvalueReverse tests opposite directions. No key is required. The paper URL supplied for this task "
        "returned a browser check, so API semantics were checked against the resource's own docs and source.",
        "",
        "An initial default-filter query returned 79 signature pairs across chemical and gene libraries. "
        "The final query explicitly selects the nine chemical libraries below, `filterFda=false`, "
        "`filterKo=false`, `overlapGe=1`, `pvalueLe=1`, `adjPvalueLe=1`, `topN=10000`, "
        "`sortby=pvalue_reverse`, and pages of 10000 using offset until totalCount is reached. "
        "The full returned universe is ranked without a significance cutoff. `topN` is a server search "
        "parameter, not a guarantee of database-wide coverage. Pagination counts and response hashes are retained.",
        "",
        ", ".join(perturbseqr.DRUG_LIBRARIES) + ".",
        "",
        "Each normalized chemical gets its minimum raw reversal p-value across returned signatures. "
        "Lower score means stronger reversal enrichment; tied p-values share competition rank. "
        "Values within 1e-9 above 1 are clamped to 1; larger or "
        "nonfinite values abort the comparison. Raw values remain in the cache. "
        "`n_ranked` counts unique normalized compounds in this returned universe, not all compounds "
        "in the underlying database. This is an exploratory best-signature summary, not the website's "
        "consensus statistic; it favors compounds with more contexts and does not imply significance.",
        "",
        "Matching casefolds names, replaces hyphens with spaces, removes recognized trailing salts, "
        "then removes spaces. Exact pert_iname matches take priority, followed by a direct pert_id "
        "when returned by CLUE, then drug_name as fallback. Duplicate pool IDs sharing the same "
        "normalized perturbation name can share a resource rank. No fuzzy matches. Fallback aliases "
        "shared by distinct normalized perturbation names are left unscored. "
        "not_found means no match in the returned universe, not "
        "absence from the resource or evidence against reversal.",
        "",
        "[CLUE's documented API](https://clue.io/connectopedia/query_api_tutorial) submits paired GMT "
        "Entrez lists to `/api/jobs` with `user_key` from TS_CLUE_API_KEY, polls "
        "`/api/jobs/findByJobId/{id}`, and downloads the result archive. The optional collector reads "
        "`ps_pert_summary.gctx`, orders tau ascending and skips missing values. Without the key it makes "
        "no request and records needs_key. The authenticated path was not live-verified in this run.",
        "",
        "## Coverage and correlation",
        "",
        "Spearman compares local consensus median with each external score over matched top-100 "
        "compounds only. Both scores rank reversal lower, so positive rho indicates agreement. "
        "No missing-score imputation. Fewer than three overlaps or constant scores means rho is undefined. "
        "P-values are descriptive, unadjusted, and conditional on this selected top-100 set.",
        "",
        "| Resource | Available / 100 | Ranked universe | Spearman rho | Descriptive p |",
        "|---|---:|---:|---:|---:|",
    ]
    for resource in ("tauchstone_lincs_gold", "perturb_seqr", "clue"):
        subset = frame[frame.resource == resource]
        c = correlation(pool, frame, resource)
        ranked = subset.n_ranked.dropna()
        rho = "undefined" if c["rho"] is None else f"{c['rho']:.6f}"
        pval = "undefined" if c["pvalue"] is None else f"{c['pvalue']:.6g}"
        lines.append(
            f"| {resource} | {c['n']} | {int(ranked.iloc[0]) if len(ranked) else 'unavailable'} | {rho} | {pval} |"
        )
    lines += ["", "Local self-correlation is a reference only.", ""]
    for resource in ("perturb_seqr", "clue"):
        subset = frame[frame.resource == resource]
        counts = subset.status.value_counts().to_dict()
        lines += [f"{resource} statuses: `{json.dumps(counts, sort_keys=True)}`.", ""]
        if not (subset.status == "available").any():
            lines += [str(subset.iloc[0].note), ""]
    lines += [
        "## Limits and reproducibility",
        "",
        "Perturb-Seqr includes LINCS L1000 chemical data, so agreement can reflect shared source data. "
        "The server may also include contexts that Tauchstone holds out. All external results are "
        "therefore quarantined in report-only outputs and provide no held-out validation claim. "
        "Resources differ in species, cells, assay, background, context counts and scoring. "
        "A low or missing correlation is not a verdict on a compound. "
        "A human must review any scientific interpretation.",
        "",
        "Run `uv run python -m pipelines.resources.collect`; replay without network with "
        "`uv run python -m pipelines.resources.collect --offline`. Defaults use $TS_DATA_DIR or "
        "~/Data/tauchstone. Raw responses and request metadata live in raw/resources/{resource}/, "
        "named with UTC timestamp and SHA-256; query.json records the exact symbols and Entrez IDs. "
        "Processed resources/agreement.parquet has a provenance sidecar including input hashes, "
        "raw response hashes, parameters, git commit and output checksum. No randomness is used.",
        "",
        f"Processing commit: `{provenance.git_commit}`.",
        "",
    ]
    for resource, cache in caches.items():
        lines.append(
            f"{resource}: {len(cache.inputs)} cached artifacts; fetched_at "
            f"{min(cache.fetched_at) if cache.fetched_at else 'unspecified'} to "
            f"{max(cache.fetched_at) if cache.fetched_at else 'unspecified'}."
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def run(data_dir: Path, report: Path, offline: bool = False) -> pd.DataFrame:
    processed = data_dir / "processed"
    query, inputs = load_query(processed)
    pool = pd.read_parquet(processed / "scores/GSE132903__main__candidate_pool.parquet")
    top = pool.sort_values("pool_rank").head(100)
    timestamp = now()
    rows = [
        {
            "pert_id": r.pert_id,
            "resource": "tauchstone_lincs_gold",
            "status": "available",
            "rank": int(r.pool_rank),
            "n_ranked": len(pool),
            "score": float(r.consensus_median),
            "fetched_at": timestamp,
            "source_url": "scores/GSE132903__main__candidate_pool.parquet",
            "note": f"{LABEL}. Existing pool rank; negative consensus means reversal.",
        }
        for r in top.itertuples()
    ]
    caches = {}
    for resource, module in (("perturb_seqr", perturbseqr), ("clue", clue)):
        raw_name = "perturbseqr" if resource == "perturb_seqr" else resource
        cache = Cache(data_dir / "raw" / "resources" / raw_name, offline=offline)
        caches[resource] = cache
        key = os.environ.get("TS_CLUE_API_KEY", "")
        if resource == "clue" and not key:
            rows.extend(
                agreement_rows(
                    pool,
                    [],
                    resource,
                    None,
                    module.URL,
                    status="needs_key",
                    note="TS_CLUE_API_KEY is not set; no request made.",
                )
            )
            continue
        cache.root.mkdir(parents=True, exist_ok=True)
        query_path = cache.record("query.json", json.dumps(query, indent=2).encode(), module.URL)
        inputs[str(query_path)] = sha256_file(query_path)
        cache.fetched_at.clear()
        try:
            if resource == "clue":
                ranked = module.fetch(query["up_entrez"], query["down_entrez"], key, cache)
            else:
                ranked = module.fetch(query["up"], query["down"], cache)
            note = (
                "Minimum raw reversal p-value across chemical signatures; lower means reversal enrichment."
                if resource == "perturb_seqr"
                else "CLUE per-compound tau; negative means reversal."
            )
            rows.extend(agreement_rows(pool, ranked, resource, max(cache.fetched_at), module.URL, note=note))
        except (httpx.HTTPError, ValueError, KeyError, TypeError, OSError, TimeoutError, tarfile.TarError) as error:
            rows.extend(
                agreement_rows(
                    pool,
                    [],
                    resource,
                    None,
                    module.URL,
                    status="not_available",
                    note=f"{type(error).__name__}: {error}",
                )
            )
        inputs.update(cache.inputs)
    frame = pd.DataFrame(rows, columns=COLUMNS)
    for column in ("rank", "n_ranked"):
        frame[column] = frame[column].astype("Int64")
    frame["score"] = pd.to_numeric(frame.score, errors="raise").astype("Float64")
    output = processed / "resources" / "agreement.parquet"
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(".parquet.tmp")
    frame.to_parquet(temp, index=False)
    temp.replace(output)
    provenance = Provenance(
        step="resources.agreement",
        dataset_accession="GSE132903",
        inputs=inputs,
        sample_filter="existing candidate pool top 100 by pool_rank",
        gene_mapping_version="lincs/genes.parquet sha256 recorded in inputs",
        model="report-only paired enrichment; minimum reversal p-value per compound",
        parameters={
            "query": query,
            "libraries": list(perturbseqr.DRUG_LIBRARIES),
            "page_size": 10000,
            "pvalueLe": 1,
            "adjPvalueLe": 1,
            "overlapGe": 1,
            "topN": 10000,
            "ranking": "competition",
            "pvalue_rounding_tolerance": 1e-9,
        },
        validation_context=LABEL,
    )
    provenance.write(output)
    write_report(report, query, pool, frame, provenance, caches)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--report", type=Path, default=Path("docs/resources_report.md"))
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    frame = run(args.data_dir, args.report, args.offline)
    print(frame.groupby(["resource", "status"]).size().to_string())


if __name__ == "__main__":
    main()
