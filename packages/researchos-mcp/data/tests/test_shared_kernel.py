from pathlib import Path

from researchos_data_mcp.shared_kernel import SharedKernel


def test_two_clients_share_one_project_namespace(tmp_path: Path):
    first = SharedKernel(tmp_path)
    second = SharedKernel(tmp_path)
    try:
        assert first.execute("shared_value = 40", ".", 10).get("error") is None
        result = second.execute("shared_value += 2\nprint(shared_value)", ".", 10)
        assert result["stdout"] == "42\n"
    finally:
        first.shutdown()
