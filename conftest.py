"""Make the whole suite runnable with a single `pytest` from the repo root.

`backend_api/tests/` imports the service as `app.…` (`from app.main import app`),
which only resolves when `backend_api/` is on `sys.path` — i.e. when pytest is
invoked from inside that directory. Running `pytest` at the root previously
failed collection with a bare `ModuleNotFoundError: No module named 'app'`,
which reads like the service is broken rather than like a path issue.

Adding `backend_api/` to the path here keeps the service's own imports
unchanged (uvicorn still starts it as `app.main:app` from that directory) while
letting the root-level suites — `tests/`, `edge_vision/`, `backend_api/tests/` —
all run in one command.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

for path in (ROOT, ROOT / "backend_api"):
    entry = str(path)
    if entry not in sys.path:
        sys.path.insert(0, entry)
