"""FastMCP entrypoint for ResearchOS publication-quality statistical plotting."""

from mcp.server import FastMCP

from .paths import project_root
from .service import annotate_significance, chart_create, chart_tune

mcp = FastMCP("researchos-plot")
ROOT = project_root()


@mcp.tool(name="plot_chart_create")
def plot_chart_create(template: str, data: dict, theme: str = "nature", spec: dict | None = None) -> dict:
    """Create a reproducible publication chart and return its PDF plus SVG preview.

    template: grouped_bar | scatter_regression | boxplot | violin | survival | heatmap.
    data: exactly one of {"file": "project-relative.csv"} or {"inline": [{...}]}.
    spec: encoding/axes/legend overrides; encoding x/y is required except for heatmap.
    """
    result = chart_create(ROOT, template, data, theme, spec)
    result["researchos.ui"] = {"panel": "plot", "resource": result.get("chart_id"), "mode": "auto"}
    return result


@mcp.tool(name="plot_chart_tune")
def plot_chart_tune(chart_id: str, patch: dict) -> dict:
    """Deep-merge a chart spec patch and rerender without losing unrelated settings.

    If chart.py was manually edited after spec.json, code-priority mode reruns that script and
    leaves the spec untouched rather than overwriting the user's code.
    """
    result = chart_tune(ROOT, chart_id, patch)
    result["researchos.ui"] = {"panel": "plot", "resource": chart_id, "mode": "auto"}
    return result


@mcp.tool(name="plot_annotate_significance")
def plot_annotate_significance(
    chart_id: str, test: str = "ttest", groups: list[list[str]] | None = None
) -> dict:
    """Run real SciPy tests for group pairs and overlay strict */**/*** significance marks.

    test: ttest | anova | mannwhitneyu. groups: [["control", "treated"], ...].
    """
    result = annotate_significance(ROOT, chart_id, test, groups or [])
    result["researchos.ui"] = {"panel": "plot", "resource": chart_id, "mode": "auto"}
    return result


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
