from mcp.server import FastMCP

mcp = FastMCP("researchos-plot")


@mcp.tool()
def plot_chart_create(template: str, data_file: str = "", theme: str = "nature") -> dict:
    """Create a publication-quality statistical chart from a template and data source."""
    return {"chart_id": f"stub:{template}", "artifact_path": "stub.pdf", "preview_svg": "<svg/>", "note": "MCP stub - requires matplotlib"}


@mcp.tool()
def plot_chart_tune(chart_id: str, patch: dict) -> dict:
    """Tune chart parameters and regenerate. Bidirectional sync with underlying Python code."""
    return {"chart_id": chart_id, "artifact_path": "stub.pdf", "code": "# stub", "note": "MCP stub"}


@mcp.tool()
def plot_annotate_significance(chart_id: str, test: str = "ttest", groups: list[str] | None = None) -> dict:
    """Run statistical test and overlay significance stars (*/**/***) on the chart."""
    groups = groups or []
    return {"chart_id": chart_id, "artifact_path": "stub.pdf", "p_values": [], "note": "MCP stub - requires scipy"}


def main():
    mcp.run()


if __name__ == "__main__":
    main()
