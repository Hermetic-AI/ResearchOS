"""Single project-scoped Python kernel broker."""

import json
import secrets
import socketserver
import sys
import time
from pathlib import Path

from .kernel import Kernel

IDLE_TIMEOUT_S = 30 * 60


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    state_dir = root / ".researchos"
    state_dir.mkdir(parents=True, exist_ok=True)
    metadata = state_dir / "data-kernel.json"
    lock = state_dir / "data-kernel.lock"
    token = secrets.token_urlsafe(32)
    kernel = Kernel(root)
    stopping = False
    last_activity = time.monotonic()

    class Handler(socketserver.StreamRequestHandler):
        def handle(self) -> None:
            nonlocal stopping, last_activity
            request = json.loads(self.rfile.readline())
            if request.get("token") != token:
                self._send({"ok": False, "error": "unauthorized"})
                return
            last_activity = time.monotonic()
            operation = request.get("op")
            if operation == "ping":
                self._send({"ok": True, "result": {"ready": True}})
                return
            if operation == "shutdown":
                self._send({"ok": True, "result": {"stopping": True}})
                stopping = True
                return
            if operation != "exec":
                self._send({"ok": False, "error": f"unsupported operation: {operation}"})
                return
            result = kernel.execute(str(request.get("code", "")), str(request.get("workdir", ".")), int(request.get("timeout_s", 120)))
            self._send({"ok": True, "result": result})

        def _send(self, value: dict) -> None:
            self.wfile.write((json.dumps(value, ensure_ascii=False) + "\n").encode())

    server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    server.timeout = 1
    temporary = metadata.with_suffix(".tmp")
    temporary.write_text(json.dumps({"port": server.server_address[1], "token": token}), encoding="utf8")
    temporary.replace(metadata)
    lock.unlink(missing_ok=True)
    try:
        while not stopping and time.monotonic() - last_activity < IDLE_TIMEOUT_S:
            server.handle_request()
    finally:
        server.server_close()
        kernel.close()
        metadata.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
