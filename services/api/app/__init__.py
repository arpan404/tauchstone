"""Tauchstone API package.

Ensures the repo root (for ``pipelines.*`` and ``data/manifests``) and this
package's parent (for ``app.*``) are importable no matter the launcher
(pytest sets pythonpath already; plain ``uvicorn app.main:app`` from
services/api does not include the root).
"""

import sys
from pathlib import Path

_PKG_PARENT = Path(__file__).resolve().parent.parent  # services/api
_REPO_ROOT = _PKG_PARENT.parent.parent  # repo root
for _p in (_PKG_PARENT, _REPO_ROOT):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

del sys, Path, _p
