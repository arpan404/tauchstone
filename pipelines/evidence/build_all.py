"""Run the full WS4 evidence build for one ranking (default GSE132903__main).

Reruns cleanly; extra rows from older pools are kept only where harmless (targets /
approval cover the whole drug map by design). Coverage checks enforce the new pool.
"""

from __future__ import annotations

import argparse
import subprocess
import sys


def run(mod: str, ranking: str, extra: list[str] | None = None) -> None:
    cmd = [sys.executable, "-m", f"pipelines.evidence.{mod}", "--ranking", ranking] + (extra or [])
    print(f"+ {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranking", default="GSE132903__main")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--no-report", action="store_true")
    args = ap.parse_args()

    run("targets", args.ranking)
    run("ad_association", args.ranking)
    run("brain_expression", args.ranking)
    run("approval", args.ranking)
    run("exposure", args.ranking)
    run("structures", args.ranking, ["--no-download"] if args.no_download else [])
    if not args.no_report:
        from pipelines.evidence import evidence_report
        evidence_report.main(args.ranking)


if __name__ == "__main__":
    main()
