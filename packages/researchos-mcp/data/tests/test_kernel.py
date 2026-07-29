import pytest

from researchos_data_mcp.kernel import Kernel
from researchos_data_mcp.sandbox import SandboxViolation, resolve_inside


def test_whitelist_rejects_escape(tmp_path):
    with pytest.raises(SandboxViolation):
        resolve_inside(tmp_path, "../outside.txt")
    assert resolve_inside(tmp_path, "a/b.txt").is_relative_to(tmp_path.resolve())


def test_kernel_exec_and_namespace_persistence(tmp_path):
    kernel = Kernel(tmp_path)
    try:
        first = kernel.execute("x = 41\nprint('stored')", ".", 10)
        assert first["error"] is None
        assert "stored" in first["stdout"]
        second = kernel.execute("print(x + 1)", ".", 10)
        assert "42" in second["stdout"]
    finally:
        kernel.close()


def test_kernel_sandbox_violation_is_reported(tmp_path):
    kernel = Kernel(tmp_path)
    try:
        result = kernel.execute("import os\nprint(os.getcwd())", "..", 10)
        assert result["error"]["type"] == "SandboxViolation"
    finally:
        kernel.close()


def test_kernel_network_is_blocked(tmp_path):
    kernel = Kernel(tmp_path)
    try:
        result = kernel.execute(
            "import socket\nsocket.create_connection(('example.com', 80))", ".", 10
        )
        assert result["error"] is not None
        assert "network access is disabled" in result["error"]["message"]
    finally:
        kernel.close()


def test_kernel_timeout_restarts_and_reports(tmp_path):
    kernel = Kernel(tmp_path)
    try:
        result = kernel.execute("import time\ntime.sleep(30)", ".", 2)
        assert result["error"]["type"] == "TimeoutError"
        assert "namespace was reset" in result["stderr"]
        # worker 已重启，后续调用仍可用
        follow = kernel.execute("print('alive')", ".", 10)
        assert "alive" in follow["stdout"]
    finally:
        kernel.close()


def test_kernel_output_truncation(tmp_path):
    kernel = Kernel(tmp_path)
    try:
        result = kernel.execute("print('x' * (70 * 1024))", ".", 10)
        assert len(result["stdout"]) <= 70 * 1024
        assert result["stdout"].endswith("[truncated]")
    finally:
        kernel.close()
