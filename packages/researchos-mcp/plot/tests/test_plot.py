import json
from pathlib import Path

import pytest

from researchos_plot_mcp.bridge import dispatch
from researchos_plot_mcp.service import annotate_significance, chart_create, chart_tune
from researchos_plot_mcp.spec import deep_merge, stars_for_p


@pytest.mark.parametrize(
    ("template", "rows", "encoding", "call"),
    [
        (
            "grouped_bar",
            [{"group": "A", "value": 1}, {"group": "B", "value": 2}],
            {"x": "group", "y": "value", "error": "sem"},
            "render_grouped_bar",
        ),
        (
            "scatter_regression",
            [{"dose": 1, "value": 2}, {"dose": 2, "value": 4}, {"dose": 3, "value": 5}],
            {"x": "dose", "y": "value"},
            "render_scatter_regression",
        ),
        (
            "boxplot",
            [{"group": "A", "value": 1}, {"group": "A", "value": 2}, {"group": "B", "value": 3}],
            {"x": "group", "y": "value"},
            "render_boxplot",
        ),
        (
            "violin",
            [{"group": "A", "value": value} for value in range(5)]
            + [{"group": "B", "value": value + 2} for value in range(5)],
            {"x": "group", "y": "value"},
            "render_violin",
        ),
        (
            "survival",
            [
                {"time": 1, "event": 1, "arm": "A"},
                {"time": 2, "event": 0, "arm": "A"},
                {"time": 1, "event": 1, "arm": "B"},
                {"time": 3, "event": 1, "arm": "B"},
            ],
            {"x": "time", "y": "event", "group": "arm"},
            "render_survival",
        ),
        (
            "heatmap",
            [{"a": 1, "b": 2}, {"a": 2, "b": 3}, {"a": 3, "b": 5}],
            {},
            "render_heatmap",
        ),
    ],
)
def test_six_templates_render(
    tmp_path: Path, template: str, rows: list[dict], encoding: dict, call: str
) -> None:
    result = chart_create(
        tmp_path,
        template,
        {"inline": rows},
        "nature",
        {"encoding": encoding},
    )
    directory = tmp_path / ".researchos" / "plots" / "charts" / result["chart_id"]
    assert call in (directory / "chart.py").read_text(encoding="utf8")
    assert (directory / "out" / "figure.svg").stat().st_size > 0
    assert (directory / "out" / "figure.pdf").stat().st_size > 0
    assert result["preview_svg"].lstrip().startswith("<?xml")


def test_tune_deep_merges_and_preserves_data(tmp_path: Path) -> None:
    created = chart_create(
        tmp_path,
        "grouped_bar",
        {"inline": [{"group": "A", "value": 1}, {"group": "B", "value": 2}]},
        "nature",
        {"encoding": {"x": "group", "y": "value"}},
    )
    tuned = chart_tune(tmp_path, created["chart_id"], {"axes": {"y_label": "Response"}})
    spec = json.loads(
        (tmp_path / ".researchos" / "plots" / "charts" / created["chart_id"] / "spec.json").read_text()
    )
    assert tuned["code_priority"] is False
    assert spec["axes"] == {"tick_font_size": 7, "y_label": "Response"}
    assert spec["encoding"]["x"] == "group"


def test_real_significance_is_persisted_and_rendered(tmp_path: Path) -> None:
    rows = [
        *({"group": "control", "value": value} for value in [1, 1.1, 0.9, 1.2, 1.0]),
        *({"group": "treated", "value": value} for value in [8, 9, 10, 11, 12]),
    ]
    created = chart_create(
        tmp_path,
        "boxplot",
        {"inline": rows},
        "nature",
        {"encoding": {"x": "group", "y": "value"}},
    )
    result = annotate_significance(
        tmp_path, created["chart_id"], "ttest", [["control", "treated"]]
    )
    assert result["p_values"][0]["p_value"] < 0.001
    assert result["p_values"][0]["stars"] == "***"
    spec = json.loads(
        (tmp_path / ".researchos" / "plots" / "charts" / created["chart_id"] / "spec.json").read_text()
    )
    assert spec["annotations"][0]["groups"] == ["control", "treated"]


def test_boundaries_and_deep_merge() -> None:
    assert [stars_for_p(value) for value in (0.05, 0.049, 0.01, 0.009, 0.001, 0.0009)] == [
        "ns",
        "*",
        "*",
        "**",
        "**",
        "***",
    ]
    assert deep_merge({"axes": {"x": "a", "y": "b"}}, {"axes": {"y": "c"}}) == {
        "axes": {"x": "a", "y": "c"}
    }


def test_http_bridge_dispatches_create(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCHOS_PROJECT_ROOT", str(tmp_path))
    result = dispatch(
        {
            "operation": "create",
            "payload": {
                "template": "scatter_regression",
                "data": {"inline": [{"x": 1, "y": 2}, {"x": 2, "y": 4}]},
                "theme": "nature",
                "spec": {"encoding": {"x": "x", "y": "y"}},
            },
        }
    )
    assert result["chart_id"].startswith("chart_")
    assert (tmp_path / result["artifact_path"]).stat().st_size > 0
