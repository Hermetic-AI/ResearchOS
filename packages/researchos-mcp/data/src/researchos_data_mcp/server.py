"""researchos-data MCP server: sandboxed Python tools for the data analysis module."""

import json
import os
import subprocess
import time
from pathlib import Path

from mcp.server import FastMCP

from . import charts, db, profiling, stats
from .frames import load_frame, register_dataset
from .sandbox import resolve_inside
from .shared_kernel import SharedKernel

mcp = FastMCP("researchos-data")

ROOT = Path(os.environ.get("RESEARCHOS_PROJECT_ROOT", Path.cwd())).resolve()
KERNEL = SharedKernel(ROOT)

KIND_BY_FORMAT = {"pdf": "chart", "svg": "chart", "png": "chart", "csv": "table", "json": "report"}


@mcp.tool()
def run_python(code: str, workdir: str = ".", timeout_s: int = 120, cell_id: str | None = None) -> dict:
    """Execute Python code in the sandboxed kernel (shared namespace across calls).

    code: Python source to exec. workdir: relative to the project root (whitelist enforced).
    timeout_s: hard timeout; on timeout the kernel restarts and the namespace resets.
    Artifacts written under .researchos/artifacts/ during execution are collected and registered.
    """
    artifacts_root = db.artifacts_dir(ROOT)
    before = {path.name: path.stat().st_mtime for path in artifacts_root.glob("*")} if artifacts_root.exists() else {}
    started = time.monotonic()
    result = KERNEL.execute(code, workdir, timeout_s)
    duration_ms = int((time.monotonic() - started) * 1000)
    after = {path.name: path.stat().st_mtime for path in artifacts_root.glob("*")} if artifacts_root.exists() else {}
    created = [name for name in after if name not in before]
    with db.connect(ROOT) as conn:
        for name in created:
            fmt = Path(name).suffix.lstrip(".").lower()
            db.insert_artifact(
                conn,
                kind=KIND_BY_FORMAT.get(fmt, "report"),
                path=name,
                fmt=fmt or "json",
                cell_id=cell_id,
            )
        conn.commit()
    return {
        "stdout": result["stdout"],
        "stderr": result["stderr"],
        "artifacts": created,
        "duration_ms": duration_ms,
        **({"error": result["error"]} if result.get("error") else {}),
    }


@mcp.tool()
def profile(file: str) -> dict:
    """Profile a CSV/Parquet/JSON file inside the project root.

    Returns schema (name/dtype/null_count/unique_count per column), numeric stats
    (mean/std/min/p25/p50/p75/max), and anomalies (high_null_ratio/outlier_iqr/constant/dup_rows).
    The dataset is registered and the profile cached in the artifact store.
    """
    frame, relative, size = load_frame(ROOT, file)
    result = profiling.profile_frame(frame)
    with db.connect(ROOT) as conn:
        register_dataset(conn, root=ROOT, relative=relative, size=size, profile_json=result)
        conn.commit()
    result["researchos.ui"] = {"panel": "data", "resource": relative, "mode": "auto"}
    return result


@mcp.tool()
def stat_test(file: str, test: str, columns: list[str], params: dict | None = None) -> dict:
    """Run a statistical test on a data file.

    test: ttest | mannwhitney | anova | kruskal | chi2 | shapiro | pearson | spearman.
    columns: value columns (two for two-sample tests/correlation/chi2).
    params: e.g. {"group_col": "arm", "equal_var": false} for grouped tests.
    Returns statistic, p_value, a Chinese conclusion with effect size, and the stat_tests row id.
    """
    frame, relative, size = load_frame(ROOT, file)
    result = stats.run_test(frame, test, columns, params or {})
    conclusion = stats.conclude(test, result)
    with db.connect(ROOT) as conn:
        register_dataset(conn, root=ROOT, relative=relative, size=size)
        test_id = db.insert_stat_test(
            conn,
            test=test,
            columns_json=json.dumps({"columns": columns, "params": params or {}}, ensure_ascii=False),
            statistic=result["statistic"],
            p_value=result["p_value"],
            conclusion=conclusion,
            dataset_id=db.dataset_id_for_path(conn, relative),
        )
        conn.commit()
    return {
        "statistic": result["statistic"],
        "p_value": result["p_value"],
        "conclusion": conclusion,
        "test_id": test_id,
        "researchos.ui": {"panel": "data", "resource": relative, "mode": "auto"},
    }


@mcp.tool()
def chart(file: str, kind: str, spec: dict, format: str = "pdf", dpi: int = 300) -> dict:
    """Render an academic chart to .researchos/artifacts/ and register it.

    kind: line | bar | scatter | hist | box | heatmap | pair.
    spec: {"x": ..., "y": ..., "hue": ..., "title": ..., "theme": "nature"|"ieee", "label": ...}.
    format: pdf | svg | png (300+ DPI for png). A svg preview and a LaTeX figure snippet
    are always produced. The full spec is stored for replay (reproducibility).
    """
    frame, _relative, _size = load_frame(ROOT, file)
    figure = charts.render(frame, kind, spec)
    artifacts_root = db.artifacts_dir(ROOT)
    artifacts_root.mkdir(parents=True, exist_ok=True)
    stem = f"art_{int(time.time() * 1000)}"
    main_path = artifacts_root / f"{stem}.{format}"
    figure.savefig(main_path, dpi=dpi, bbox_inches="tight", format=format)
    preview_path = artifacts_root / f"{stem}.preview.svg"
    figure.savefig(preview_path, bbox_inches="tight", format="svg")
    preview_svg = preview_path.read_text(encoding="utf8")
    snippet = charts.latex_snippet(main_path.name, spec)
    with db.connect(ROOT) as conn:
        artifact_id = db.insert_artifact(
            conn,
            kind="chart",
            path=main_path.name,
            preview_path=preview_path.name,
            fmt=format,
            dpi=dpi,
            latex_snippet=snippet,
            spec_json=charts.spec_json(kind, spec, format, dpi),
        )
        conn.commit()
    import matplotlib.pyplot as plt

    plt.close(figure)
    return {
        "artifact_path": main_path.name,
        "preview_svg": preview_svg,
        "latex_snippet": snippet,
        "artifact_id": artifact_id,
        "researchos.ui": {"panel": "data", "resource": artifact_id, "mode": "auto"},
    }


@mcp.tool()
def link_experiment(
    artifact_path: str,
    commit: str | None = None,
    tex_file: str | None = None,
    tex_section: str | None = None,
) -> dict:
    """Link an artifact to a git commit and a LaTeX section (artifact ↔ commit ↔ section).

    artifact_path: artifact file name (or id) from a previous chart/run_python call.
    commit: 40-char sha; defaults to the current HEAD (NULL when the project is not a git repo).
    tex_section: \\section{} title or \\label{} key in tex_file; a missing section yields a
    warning but the link is still recorded (the section may be added later).
    """
    with db.connect(ROOT) as conn:
        row = db.artifact_for_path(conn, artifact_path)
        if not row:
            raise ValueError(f"unknown artifact: {artifact_path}")
        artifact_id = row[0]
        resolved_commit = commit if commit is not None else _git_head()
        warning = None
        if tex_file and tex_section:
            warning = _check_tex_section(tex_file, tex_section)
        db.upsert_link(
            conn,
            artifact_id=artifact_id,
            commit=resolved_commit,
            tex_file=tex_file,
            tex_section=tex_section,
        )
        conn.commit()
    return {"ok": True, **({"warning": warning} if warning else {})}


def _git_head() -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=False, timeout=10
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _check_tex_section(tex_file: str, tex_section: str) -> str | None:
    path = resolve_inside(ROOT, tex_file)
    if not path.exists():
        return f"tex_file not found: {tex_file}"
    content = path.read_text(encoding="utf8")
    if f"\\section{{{tex_section}}}" in content or f"\\label{{{tex_section}}}" in content:
        return None
    return f"section '{tex_section}' not found in {tex_file}; link recorded anyway"


def main() -> None:
    try:
        mcp.run()
    finally:
        KERNEL.close()


if __name__ == "__main__":
    main()
