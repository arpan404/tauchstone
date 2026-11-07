"""Public paired enrichment API. Lower reversal p-values rank first."""

from __future__ import annotations

import math
import re

URL = "https://perturbseqr.maayanlab.cloud/graphql"
DRUG_LIBRARIES = (
    "CREEDS Chem",
    "DeepCover MoA",
    "Ginkgo Bioworks",
    "LINCS L1000 CP",
    "Microarrays CMAP",
    "NIBR DRUG-seq",
    "RummaGEO Chem",
    "SciPlex",
    "Tahoe-100M",
)
QUERY = """query PairEnrichmentQuery($genesUp:[String]!, $genesDown:[String]!,
    $offset:Int!, $first:Int!, $libraryNames:[String]!) {
  currentBackground {
    pairedEnrich(genesUp:$genesUp, genesDown:$genesDown, offset:$offset, first:$first,
      libraryNames:$libraryNames, sortby:"pvalue_reverse", topN:10000,
      pvalueLe:1, adjPvalueLe:1, overlapGe:1, filterFda:false, filterKo:false) {
      totalCount
      nodes { pvalueReverse geneSet { nodes { term library { name } } } }
    }
  }
}"""
# Remove only whole trailing salt tokens, preserving stereochemistry and chemical names.
SALTS = {
    "hydrochloride",
    "hydrobromide",
    "hcl",
    "hbr",
    "sodium",
    "potassium",
    "calcium",
    "mesylate",
    "mesilate",
    "besylate",
    "besilate",
    "maleate",
    "fumarate",
    "succinate",
    "tartrate",
    "bitartrate",
    "sulfate",
    "sulphate",
    "phosphate",
    "citrate",
    "hydrate",
    "monohydrate",
    "dihydrate",
    "trihydrate",
    "tosylate",
    "acetate",
}


def normalize_name(name: str) -> str:
    """Casefold, strip trailing salts, then remove spacing and hyphens.

    Exact normalized matches only; no fuzzy or substring matching.
    """
    tokens = re.sub(r"[-‐‑–−_]", " ", str(name).casefold()).split()
    while tokens and tokens[-1] in SALTS:
        tokens.pop()
    return "".join(tokens)


def request(up: list[str], down: list[str], offset: int, first: int) -> dict:
    return {
        "operationName": "PairEnrichmentQuery",
        "query": QUERY,
        "variables": {
            "genesUp": up,
            "genesDown": down,
            "offset": offset,
            "first": first,
            "libraryNames": list(DRUG_LIBRARIES),
        },
    }


def parse_page(payload: dict) -> tuple[int, list[dict]]:
    """Reject GraphQL failures, gene libraries, and malformed probabilities."""
    if payload.get("errors"):
        raise ValueError(f"GraphQL errors: {payload['errors']}")
    result = payload["data"]["currentBackground"]["pairedEnrich"]
    compounds = []
    for node in result["nodes"]:
        pvalue = float(node["pvalueReverse"])
        if not math.isfinite(pvalue) or not 0 <= pvalue <= 1 + 1e-9:
            raise ValueError("Invalid reversal p-value")
        # The API returns tiny Fisher-test rounding overshoots near 1.
        pvalue = min(pvalue, 1.0)
        names: dict[str, set[str]] = {}
        for gs in node["geneSet"]["nodes"]:
            library = gs["library"]["name"]
            if library not in DRUG_LIBRARIES:
                continue
            name = gs["term"].split("::", 1)[0].strip()
            key = normalize_name(name)
            if key:
                names.setdefault(key, set()).add(library)
        for key, libraries in names.items():
            compounds.append({"name": key, "score": pvalue, "libraries": sorted(libraries)})
    return int(result["totalCount"]), compounds


def rank_compounds(rows: list[dict]) -> list[dict]:
    """Best signature per compound; equal p-values share competition rank."""
    best: dict[str, dict] = {}
    for row in rows:
        key = row["name"]
        if key not in best or row["score"] < best[key]["score"]:
            best[key] = dict(row)
        elif row["score"] == best[key]["score"]:
            best[key]["libraries"] = sorted(set(best[key]["libraries"]) | set(row["libraries"]))
    ordered = sorted(best.values(), key=lambda r: (r["score"], r["name"]))
    rank = 0
    previous = None
    for index, row in enumerate(ordered, 1):
        if row["score"] != previous:
            rank = index
        row["rank"] = rank
        previous = row["score"]
    return ordered


def fetch(up: list[str], down: list[str], cache, page_size: int = 10000) -> list[dict]:
    rows = []
    offset, expected = 0, None
    while True:
        payload = cache.post(URL, request(up, down, offset, page_size))
        total, parsed = parse_page(payload)
        count = len(payload["data"]["currentBackground"]["pairedEnrich"]["nodes"])
        if expected is not None and total != expected:
            raise ValueError("Result count changed during pagination; retry from a fresh cache")
        expected = total
        if not count and offset < total:
            raise ValueError("Truncated pagination")
        rows.extend(parsed)
        offset += count
        print(f"Perturb-Seqr: {offset}/{total} signature pairs", flush=True)
        if offset >= total:
            break
    return rank_compounds(rows)
