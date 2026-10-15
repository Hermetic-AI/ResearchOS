"""Kernel manager: owns the worker subprocess and its JSON-RPC line protocol."""

import json
import subprocess
import sys
import threading
from pathlib import Path

WORKER = Path(__file__).with_name("kernel_worker.py")


class Kernel:
    """Serializes exec requests onto one worker; kills and restarts it on timeout."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.worker: subprocess.Popen[str] | None = None
        self.lock = threading.Lock()

    def _ensure(self) -> subprocess.Popen[str]:
        if self.worker is None or self.worker.poll() is not None:
            self.worker = subprocess.Popen(
                [sys.executable, "-u", str(WORKER), str(self.root)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                text=True,
                cwd=str(self.root),
            )
        return self.worker

    def execute(self, code: str, workdir: str, timeout_s: int) -> dict:
        with self.lock:
            worker = self._ensure()
            assert worker.stdin is not None and worker.stdout is not None
            worker.stdin.write(json.dumps({"op": "exec", "code": code, "workdir": workdir}) + "\n")
            worker.stdin.flush()

            result: dict = {}

            def read_line() -> None:
                if self.worker is not None and self.worker.stdout is not None:
                    result["line"] = self.worker.stdout.readline()

            reader = threading.Thread(target=read_line, daemon=True)
            reader.start()
            reader.join(timeout_s)
            if reader.is_alive():
                # 超时即重启 worker，共享命名空间随之清空（设计 §6.3）
                worker.kill()
                self.worker = None
                return {
                    "stdout": "",
                    "stderr": "kernel restarted due to timeout; shared namespace was reset",
                    "error": {
                        "type": "TimeoutError",
                        "message": f"execution exceeded {timeout_s}s",
                        "traceback": "",
                    },
                }
            line = result.get("line", "")
            if not line:
                return {
                    "stdout": "",
                    "stderr": "kernel worker died",
                    "error": {"type": "KernelDied", "message": "worker exited unexpectedly", "traceback": ""},
                }
            return json.loads(line)

    def close(self) -> None:
        if self.worker is not None and self.worker.poll() is None:
            self.worker.kill()
        self.worker = None
