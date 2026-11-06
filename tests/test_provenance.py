import json

from pipelines.common.provenance import Provenance


def test_provenance_written_next_to_output(tmp_path):
    out = tmp_path / "sig.parquet"
    out.write_bytes(b"x")
    p = Provenance(step="test", dataset_accession="GSE0", random_seed=1).write(out)
    rec = json.loads(p.read_text())
    assert p.name == "sig.parquet.provenance.json"
    for key in ["dataset_accession", "git_commit", "random_seed", "timestamp", "output_sha256"]:
        assert key in rec
