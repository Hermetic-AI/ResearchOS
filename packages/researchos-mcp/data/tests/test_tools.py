from pathlib import Path

import pandas as pd
import pytest

from researchos_data_mcp import db, server
from researchos_data_mcp.kernel import Kernel


@pytest.fixture()
def workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "ROOT", tmp_path.resolve())
    kernel = Kernel(tmp_path)
    monkeypatch.setattr(server, "KERNEL", kernel)
    yield tmp_path
    kernel.close()


def write_csv(root: Path) -> str:
    (root / "datasets").mkdir(exist_ok=True)
    pd.DataFrame(
        {
            "x": range(20),
            "y": [v * 2 for v in range(20)],
            "group": ["a"] * 10 + ["b"] * 10,
        }
    ).to_csv(root / "datasets" / "sample.csv", index=False)
    return "datasets/sample.csv"


def test_profile_registers_dataset(workspace):
    result = server.profile(write_csv(workspace))
    assert {column["name"] for column in result["schema"]} == {"x", "y", "group"}
    assert result["stats"]["y"]["max"] == 38
    with db.connect(workspace) as conn:
        rows = conn.execute("SELECT name, format, profile_json FROM datasets").fetchall()
    assert len(rows) == 1
    assert rows[0][1] == "csv"
    assert rows[0][2] is not None


def test_stat_test_records_row(workspace):
    result = server.stat_test(write_csv(workspace), "pearson", ["x", "y"])
    assert result["p_value"] < 0.001
    assert "拒绝原假设" in result["conclusion"]
    with db.connect(workspace) as conn:
        rows = conn.execute("SELECT test, p_value FROM stat_tests").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "pearson"
    assert rows[0][1] == pytest.approx(result["p_value"])


def test_chart_exports_artifacts_and_registers(workspace):
    result = server.chart(
        write_csv(workspace),
        "line",
        {"x": "x", "y": "y", "title": "Growth", "theme": "nature", "label": "fig:growth"},
        format="png",
        dpi=300,
    )
    artifacts = db.artifacts_dir(workspace)
    main = artifacts / result["artifact_path"]
    assert main.exists()
    assert main.read_bytes().startswith(b"\x89PNG")
    assert result["preview_svg"].startswith("<svg") or "<svg" in result["preview_svg"][:200]
    assert "\\includegraphics" in result["latex_snippet"]
    assert "fig:growth" in result["latex_snippet"]
    with db.connect(workspace) as conn:
        row = conn.execute(
            "SELECT kind, format, dpi, spec_json FROM artifacts WHERE id = ?", (result["artifact_id"],)
        ).fetchone()
    assert row[0] == "chart"
    assert row[1] == "png"
    assert row[2] == 300
    assert '"kind": "line"' in row[3]


def test_link_experiment_roundtrip(workspace):
    chart_result = server.chart(write_csv(workspace), "scatter", {"x": "x", "y": "y"}, format="svg")
    (workspace / "main.tex").write_text("\\section{Experiments}\\label{sec:experiments}\n", encoding="utf8")
    linked = server.link_experiment(
        chart_result["artifact_path"], commit="a" * 40, tex_file="main.tex", tex_section="sec:experiments"
    )
    assert linked == {"ok": True}
    warned = server.link_experiment(
        chart_result["artifact_path"], commit="b" * 40, tex_file="main.tex", tex_section="sec:missing"
    )
    assert warned["ok"] is True
    assert "sec:missing" in warned["warning"]
    with db.connect(workspace) as conn:
        rows = conn.execute("SELECT git_commit, tex_section FROM artifact_links").fetchall()
    assert len(rows) == 2


def test_link_experiment_rejects_unknown_artifact(workspace):
    with pytest.raises(ValueError, match="unknown artifact"):
        server.link_experiment("nope.pdf", commit="a" * 40)


def test_run_python_collects_artifacts(workspace):
    code = (
        "import matplotlib\nmatplotlib.use('Agg')\n"
        "import matplotlib.pyplot as plt\n"
        "from pathlib import Path\n"
        "out = Path.cwd() / '.researchos' / 'artifacts' / 'cell-plot.png'\n"
        "out.parent.mkdir(parents=True, exist_ok=True)\n"
        "plt.plot([1, 2, 3])\n"
        "plt.savefig(out, dpi=150)\n"
        "print('done')\n"
    )
    result = server.run_python(code, workdir=".")
    assert result["duration_ms"] >= 0
    assert "done" in result["stdout"]
    assert "cell-plot.png" in result["artifacts"]
    with db.connect(workspace) as conn:
        rows = conn.execute("SELECT path FROM artifacts WHERE path = 'cell-plot.png'").fetchall()
    assert len(rows) == 1
