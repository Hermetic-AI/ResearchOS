"""Kernel worker process: exec loop with a shared namespace and no network.

Protocol: one JSON object per line on stdin, one response per line on stdout.
"""

import contextlib
import io
import json
import os
import socket
import sys
import traceback
from pathlib import Path

GLOBAL_NS: dict = {"__name__": "__kernel__"}
MAX_OUTPUT = 64 * 1024


def block_network() -> None:
    """Deny all outbound connections (no whitelist this period)."""

    def deny(*args: object, **kwargs: object) -> None:
        raise OSError("network access is disabled in the researchos sandbox")

    socket.create_connection = deny  # type: ignore[assignment]


def truncate(text: str) -> str:
    if len(text) <= MAX_OUTPUT:
        return text
    return text[:MAX_OUTPUT] + "\n[truncated]"


def execute(request: dict, root: Path) -> dict:
    workdir = (root / request.get("workdir", ".")).resolve()
    if workdir != root and root not in workdir.parents:
        return {
            "stdout": "",
            "stderr": "",
            "error": {
                "type": "SandboxViolation",
                "message": f"workdir escapes project root: {request.get('workdir')}",
                "traceback": "",
            },
        }
    try:
        os.chdir(workdir)
    except OSError as exc:
        return {
            "stdout": "",
            "stderr": "",
            "error": {"type": "SandboxViolation", "message": f"invalid workdir: {exc}", "traceback": ""},
        }
    stdout, stderr = io.StringIO(), io.StringIO()
    error = None
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exec(request["code"], GLOBAL_NS)  # noqa: S102 - sandboxed by design
    except Exception as exc:  # noqa: BLE001 - surface user code failures as data
        error = {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(limit=5),
        }
    return {"stdout": truncate(stdout.getvalue()), "stderr": truncate(stderr.getvalue()), "error": error}


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    block_network()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        if request.get("op") == "exec":
            sys.stdout.write(json.dumps(execute(request, root)) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
