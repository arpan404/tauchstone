"""One Human Protein Atlas immunofluorescence micrograph per LINCS cell line, cached for offline use.

Output: ``$TS_DATA_DIR/raw/resources/hpa_images/<cell_id>.jpg`` plus ``manifest.json`` (one record
per image: source URLs, licence, credit, checksum, caption) with a provenance sidecar. Re-running
skips images already on disk. Nothing is fetched at request time; the API/web read these files.

Which cell lines: only LINCS lines that are the *same* line as one in the HPA subcellular
(immunofluorescence) panel. Near-misses are left out on purpose: HEK293 is not HEK293T,
HUVEC/TERT2 is not HUVEC, ASC52telo is not ASC. JURKAT and THP-1 are in the HPA panel, but none of
the genes HPA files under main location "Microtubules" has an image in them, so they get none.

Which image (rule fixed before downloading, from HPA v25): for each matched line, take the first
merged image listed on the subcellular page of the first gene in this order that has an image in
that line: TUBB, then TUBA1B, then other genes whose HPA main subcellular location is exactly
"Microtubules", sorted alphabetically by symbol. Tubulins first because microtubules are also
the red reference channel of every HPA image, so the picture shows cell shape the same way for
each line. The resolved choices are hardcoded below so re-runs fetch the same files.

Image channels (HPA subcellular method page): blue = nucleus (DAPI), red = microtubules
(anti-tubulin), green = the protein of interest. The ``*_blue_red_green.jpg`` file merges those
three channels.

Licence: HPA data and images are CC BY 4.0 (https://www.proteinatlas.org/about/licence). The
credit HPA requires: "Human Protein Atlas", a link to proteinatlas.org, and the URL of the specific
image or gene page, in the form vNN.proteinatlas.org.

Downloaded files are untrusted data: they are only hashed and written to disk, never opened as code.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import httpx

from pipelines.common.paths import RAW
from pipelines.common.provenance import Provenance, sha256_file

HPA_VERSION = "25"
OUT_DIR = RAW / "resources" / "hpa_images"
LICENCE = "CC BY 4.0"
LICENCE_URL = "https://www.proteinatlas.org/about/licence"
CITATION = (
    "Thul PJ et al. A subcellular map of the human proteome. Science 2017;356(6340):eaal3321. "
    "doi:10.1126/science.aal3321"
)
CHANNELS = "Green: {gene} (antibody {antibody}); red: microtubules; blue: nucleus."
GENE_RULE = (
    "first merged image on the HPA v25 subcellular page of the first gene with an image in this "
    "line, in order TUBB, TUBA1B, then genes with HPA main location 'Microtubules' alphabetically"
)


@dataclass(frozen=True)
class Choice:
    cell_id: str  # LINCS naming
    hpa_cell_line: str  # HPA naming, exact same line
    gene: str
    ensembl_id: str
    antibody: str
    image_url: str


CHOICES: tuple[Choice, ...] = (
    Choice("A549", "A-549", "TUBB", "ENSG00000196230", "HPA043640",
           "https://images.proteinatlas.org/43640/1874_B9_31_cr5b714b3a22aca_blue_red_green.jpg"),
    Choice("HELA", "HeLa", "CRYBB3", "ENSG00000100053", "HPA055840",
           "https://images.proteinatlas.org/55840/1916_H6_11_cr5ca3689ee53c5_blue_red_green.jpg"),
    Choice("HEPG2", "Hep-G2", "NEK3", "ENSG00000136098", "HPA043230",
           "https://images.proteinatlas.org/43230/1334_D2_1_blue_red_green.jpg"),
    Choice("MCF7", "MCF-7", "TUBB", "ENSG00000196230", "HPA046280",
           "https://images.proteinatlas.org/46280/2070_F2_4_blue_red_green.jpg"),
    Choice("PC3", "PC-3", "TUBA1B", "ENSG00000123416", "HPA043684",
           "https://images.proteinatlas.org/43684/882_G9_1_blue_red_green.jpg"),
)  # fmt: skip


def page_url(c: Choice) -> str:
    return f"https://v{HPA_VERSION}.proteinatlas.org/{c.ensembl_id}-{c.gene}/subcellular"


def manifest_record(c: Choice, sha256: str) -> dict[str, str]:
    """One manifest entry. Pure: no network, no disk."""
    return {
        "cell_id": c.cell_id,
        "hpa_cell_line": c.hpa_cell_line,
        "gene": c.gene,
        "ensembl_id": c.ensembl_id,
        "antibody": c.antibody,
        "image_url": c.image_url,
        "page_url": page_url(c),
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "credit": f"Image: Human Protein Atlas (proteinatlas.org), {LICENCE}. Available from {page_url(c)}",
        "citation": CITATION,
        "sha256": sha256,
        "caption": f"{c.hpa_cell_line} cells. " + CHANNELS.format(gene=c.gene, antibody=c.antibody),
        "file": f"{c.cell_id}.jpg",
    }


def _download(client: httpx.Client, url: str, dest: Path) -> None:
    r = client.get(url)
    r.raise_for_status()
    if not r.headers.get("content-type", "").startswith("image/jpeg") or r.content[:3] != b"\xff\xd8\xff":
        raise ValueError(f"{url} did not return a JPEG")
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)


def build(out_dir: Path = OUT_DIR, choices: tuple[Choice, ...] = CHOICES) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        for c in choices:
            dest = out_dir / f"{c.cell_id}.jpg"
            if not dest.exists():
                print(f"downloading {c.cell_id} <- {c.image_url}")
                _download(client, c.image_url, dest)
            records.append(manifest_record(c, sha256_file(dest)))
    manifest = out_dir / "manifest.json"
    manifest.write_text(json.dumps(records, indent=2) + "\n")
    Provenance(
        step="evidence.cell_line_images",
        dataset_accession=f"HPA v{HPA_VERSION} subcellular",
        inputs={r["image_url"]: r["sha256"] for r in records},
        sample_filter="LINCS cell lines that are the same line as an HPA IF panel line",
        model="none (image cache)",
        parameters={"rule": GENE_RULE, "licence": LICENCE, "licence_url": LICENCE_URL},
    ).write(manifest)
    return manifest


if __name__ == "__main__":
    print(build())
