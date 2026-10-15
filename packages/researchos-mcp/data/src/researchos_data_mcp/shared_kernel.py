"""Project-local kernel broker client shared by MCP and HTTP bridges."""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path


class SharedKernel:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.state_dir = self.root / ".researchos"
        self.metadata = self.state_dir / "data-kernel.json"
        self.lock = self.state_dir / "data-kernel.lock"

    def execute(self, code: str, workdir: str, timeout_s: int) -> dict:
        endpoint = self._endpoint()
        return self._request(endpoint, {"op": "exec", "code": code, "workdir": workdir, "timeout_s": timeout_s})

    def close(self) -> None:
        # The broker is project-scoped and survives individual MCP/HTTP clients.
        return None

    def shutdown(self) -> None:
        endpoint = self._read_endpoint()
        if endpoint:
            self._request(endpoint, {"op": "shutdown"})

    def _endpoint(self) -> dict:
        endpoint = self._read_endpoint()
        if endpoint and self._healthy(endpoint):
            return endpoint
        self.state_dir.mkdir(parents=True, exist_ok=True)
        owner = self._claim_startup()
        if owner:
            self._spawn_broker()
        for _ in range(200):
            endpoint = self._read_endpoint()
            if endpoint and self._healthy(endpoint):
                return endpoint
            time.sleep(0.05)
        raise RuntimeError("data kernel broker did not become ready")

    def _read_endpoint(self) -> dict | None:
        if not self.metadata.exists():
            return None
        try:
            value = json.loads(self.metadata.read_text(encoding="utf8"))
            return value if isinstance(value, dict) else None
        except (OSError, json.JSONDecodeError):
            return None

    def _healthy(self, endpoint: dict) -> bool:
        try:
            self._request(endpoint, {"op": "ping"})
            return True
        except (OSError, RuntimeError, KeyError, ValueError):
            return False

    def _claim_startup(self) -> bool:
        try:
            descriptor = os.open(self.lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(descriptor)
            return True
        except FileExistsError:
            if time.time() - self.lock.stat().st_mtime <= 15:
                return False
            self.lock.unlink(missing_ok=True)
            return self._claim_startup()

    def _spawn_broker(self) -> None:
        kwargs: dict = {
            "cwd": str(self.root),
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen(
            [sys.executable, "-m", "researchos_data_mcp.broker", str(self.root)],
            **kwargs,
        )

    def _request(self, endpoint: dict, payload: dict) -> dict:
        request = {**payload, "token": endpoint["token"]}
        timeout = float(payload.get("timeout_s", 5)) + 5
        with socket.create_connection(("127.0.0.1", int(endpoint["port"])), timeout=timeout) as connection:
            stream = connection.makefile("rwb")
            stream.write((json.dumps(request) + "\n").encode())
            stream.flush()
            line = stream.readline()
        if not line:
            raise RuntimeError("data kernel broker closed without a response")
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(str(response.get("error", "data kernel broker failed")))
        return response.get("result", {})
