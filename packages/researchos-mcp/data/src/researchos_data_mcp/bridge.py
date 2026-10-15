"""Persistent JSON-lines bridge for browser notebook execution."""

import json
import sys

from .server import KERNEL, run_python


def dispatch(request: dict) -> dict:
    if request.get("operation") == "shutdown":
        KERNEL.shutdown()
        return {"stopping": True}
    if request.get("operation") != "run":
        raise ValueError(f"unsupported data bridge operation: {request.get('operation')}")
    payload = request.get("payload")
    if not isinstance(payload, dict):
        raise TypeError("payload must be an object")
    return run_python(
        code=str(payload["code"]),
        workdir=str(payload.get("workdir", ".")),
        timeout_s=int(payload.get("timeout_s", 120)),
        cell_id=str(payload["cell_id"]) if payload.get("cell_id") else None,
    )


def main() -> None:
    try:
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                response = {"ok": True, "result": dispatch(json.loads(line))}
            except Exception as error:  # noqa: BLE001 - JSON bridge must serialize tool failures
                response = {"ok": False, "error": f"{type(error).__name__}: {error}"}
            print(json.dumps(response, ensure_ascii=False), flush=True)
    finally:
        KERNEL.close()


if __name__ == "__main__":
    main()
