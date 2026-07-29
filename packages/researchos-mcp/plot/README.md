# ResearchOS Plot MCP

FastMCP execution plane for publication-quality statistical figures. It exposes exactly three
tools: `plot_chart_create`, `plot_chart_tune`, and `plot_annotate_significance`.

Each chart is stored under `.researchos/plots/charts/<chart_id>/` with its validated `spec.json`,
copied `data.csv`, self-contained `chart.py`, SVG preview, and PDF artifact. Metadata is shared
with the TypeScript plot plugin through `.researchos/plots.db`.

Run checks from this directory:

```sh
uv sync --dev
uv run pytest
uv run ruff check src tests
```
