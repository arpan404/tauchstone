"""HPA cell-line image manifest: record fields, licence wording, skip-if-present, no network."""

from __future__ import annotations

import hashlib
import json

import pytest

from pipelines.evidence import cell_line_images as cli

FAKE = cli.Choice(
    "FAKE1", "Fake-1", "TUBB", "ENSG00000196230", "HPA000000",
    "https://images.proteinatlas.org/0/fake_blue_red_green.jpg",
)  # fmt: skip


def test_manifest_record_fields():
    r = cli.manifest_record(FAKE, "abc")
    assert r["cell_id"] == "FAKE1" and r["hpa_cell_line"] == "Fake-1"
    assert r["page_url"] == "https://v25.proteinatlas.org/ENSG00000196230-TUBB/subcellular"
    assert r["licence"] == "CC BY 4.0"
    assert r["licence_url"] == "https://www.proteinatlas.org/about/licence"
    assert r["credit"].startswith("Image: Human Protein Atlas (proteinatlas.org), CC BY 4.0")
    assert r["page_url"] in r["credit"]
    assert r["caption"] == ("Fake-1 cells. Green: TUBB (antibody HPA000000); red: microtubules; blue: nucleus.")
    assert r["sha256"] == "abc" and r["file"] == "FAKE1.jpg"


def test_build_skips_existing_file_and_writes_manifest(tmp_path, monkeypatch):
    def no_network(*a, **k):
        raise AssertionError("must not download a file that is already present")

    monkeypatch.setattr(cli, "_download", no_network)
    body = b"\xff\xd8\xff fake jpeg"
    (tmp_path / "FAKE1.jpg").write_bytes(body)
    manifest = cli.build(tmp_path, (FAKE,))
    records = json.loads(manifest.read_text())
    assert [r["cell_id"] for r in records] == ["FAKE1"]
    assert records[0]["sha256"] == hashlib.sha256(body).hexdigest()
    prov = json.loads((tmp_path / "manifest.json.provenance.json").read_text())
    assert prov["step"] == "evidence.cell_line_images"


def test_only_exact_line_matches():
    ids = {c.cell_id for c in cli.CHOICES}
    assert not ids & {"HEK293T", "HUVEC", "ASC"}  # HEK293, HUVEC/TERT2, ASC52telo are other lines
    assert len(ids) == len(cli.CHOICES)


@pytest.mark.data
def test_real_cache_matches_manifest():
    manifest = cli.OUT_DIR / "manifest.json"
    if not manifest.exists():
        pytest.skip("run python -m pipelines.evidence.cell_line_images first")
    from pipelines.common.provenance import sha256_file

    for r in json.loads(manifest.read_text()):
        assert sha256_file(cli.OUT_DIR / r["file"]) == r["sha256"]
