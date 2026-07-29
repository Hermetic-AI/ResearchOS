import json
import shutil
import uuid
from pathlib import Path

import pandas as pd
from scipy import stats

from . import store
from .paths import relative_to_root, resolve_inside
from .render import execute_chart, render_chart_py
from .spec import build_spec, deep_merge, stars_for_p, validate_spec


def chart_create(root: Path, template: str, data: dict, theme: str, patch: dict | None) -> dict:
    spec = build_spec(template, data, theme, patch)
    chart_id = f"chart_{uuid.uuid4().hex[:12]}"
    directory = root / ".researchos" / "plots" / "charts" / chart_id
    directory.mkdir(parents=True)
    data_ref = persist_data(root, directory, data)
    spec_path = directory / "spec.json"
    code_path = directory / "chart.py"
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf8")
    code_path.write_text(render_chart_py(spec), encoding="utf8")
    spec_path.touch()
    execute_chart(code_path)
    preview = (directory / "out" / "figure.svg").read_text(encoding="utf8")
    artifact = directory / "out" / "figure.pdf"
    with store.connect(root) as connection:
        store.insert_chart(
            connection,
            chart_id=chart_id,
            workspace=str(root),
            template=template,
            theme=theme,
            spec_path=relative_to_root(root, spec_path),
            code_path=relative_to_root(root, code_path),
            data_ref=data_ref,
        )
        store.insert_artifact(
            connection,
            workspace=str(root),
            chart_id=chart_id,
            path=relative_to_root(root, artifact),
            preview_svg=preview,
        )
    return {
        "chart_id": chart_id,
        "artifact_path": relative_to_root(root, artifact),
        "preview_svg": preview,
    }


def chart_tune(root: Path, chart_id: str, patch: dict) -> dict:
    directory = chart_directory(root, chart_id)
    spec_path = directory / "spec.json"
    code_path = directory / "chart.py"
    spec = json.loads(spec_path.read_text(encoding="utf8"))
    code_priority = code_path.stat().st_mtime_ns > spec_path.stat().st_mtime_ns
    if not code_priority:
        spec = deep_merge(spec, patch)
        validate_spec(spec)
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf8")
        code_path.write_text(render_chart_py(spec), encoding="utf8")
        spec_path.touch()
    execute_chart(code_path)
    preview = (directory / "out" / "figure.svg").read_text(encoding="utf8")
    artifact = directory / "out" / "figure.pdf"
    with store.connect(root) as connection:
        store.update_chart(connection, chart_id, spec["theme"])
        store.insert_artifact(
            connection,
            workspace=str(root),
            chart_id=chart_id,
            path=relative_to_root(root, artifact),
            preview_svg=preview,
        )
    return {
        "chart_id": chart_id,
        "artifact_path": relative_to_root(root, artifact),
        "preview_svg": preview,
        "code": code_path.read_text(encoding="utf8"),
        "code_priority": code_priority,
    }


def annotate_significance(root: Path, chart_id: str, test: str, groups: list[list[str]]) -> dict:
    directory = chart_directory(root, chart_id)
    spec_path = directory / "spec.json"
    spec = json.loads(spec_path.read_text(encoding="utf8"))
    frame = pd.read_csv(directory / "data.csv")
    annotations = [calculate_annotation(frame, spec, test, pair) for pair in groups]
    result = chart_tune(root, chart_id, {"annotations": [*spec.get("annotations", []), *annotations]})
    return {
        "chart_id": chart_id,
        "artifact_path": result["artifact_path"],
        "preview_svg": result["preview_svg"],
        "p_values": [
            {"groups": annotation["groups"], "p_value": annotation["p_value"], "stars": annotation["stars"]}
            for annotation in annotations
        ],
    }


def calculate_annotation(frame: pd.DataFrame, spec: dict, test: str, pair: list[str]) -> dict:
    if len(pair) != 2:
        raise ValueError("each groups entry must contain exactly two group names")
    encoding = spec["encoding"]
    category = encoding.get("group") or encoding.get("x")
    if category in frame.columns and encoding["y"] in frame.columns:
        left = pd.to_numeric(frame.loc[frame[category].astype(str) == pair[0], encoding["y"]], errors="coerce").dropna()
        right = pd.to_numeric(frame.loc[frame[category].astype(str) == pair[1], encoding["y"]], errors="coerce").dropna()
    else:
        left = pd.to_numeric(frame[pair[0]], errors="coerce").dropna()
        right = pd.to_numeric(frame[pair[1]], errors="coerce").dropna()
    if left.empty or right.empty:
        raise ValueError(f"groups contain no numeric observations: {pair}")
    normalized = test.lower().replace("-", "").replace("_", "")
    if normalized in ("ttest", "ttestind"):
        p_value = float(stats.ttest_ind(left, right, equal_var=False).pvalue)
    elif normalized in ("mannwhitney", "mannwhitneyu"):
        p_value = float(stats.mannwhitneyu(left, right, alternative="two-sided").pvalue)
    elif normalized in ("anova", "f_oneway", "foneway"):
        p_value = float(stats.f_oneway(left, right).pvalue)
    else:
        raise ValueError(f"unsupported significance test: {test}")
    return {"groups": pair, "p_value": p_value, "stars": stars_for_p(p_value)}


def persist_data(root: Path, directory: Path, data: dict) -> str:
    target = directory / "data.csv"
    if "inline" in data:
        pd.DataFrame(data["inline"]).to_csv(target, index=False)
        return "inline"
    source = resolve_inside(root, str(data["file"]))
    if not source.is_file():
        raise ValueError(f"data file not found: {data['file']}")
    if source.suffix.lower() != ".csv":
        raise ValueError("plot data file must be CSV")
    shutil.copyfile(source, target)
    return relative_to_root(root, source)


def chart_directory(root: Path, chart_id: str) -> Path:
    if not chart_id.startswith("chart_") or any(value in chart_id for value in ("/", "\\", "..")):
        raise ValueError(f"invalid chart_id: {chart_id}")
    directory = root / ".researchos" / "plots" / "charts" / chart_id
    if not directory.is_dir():
        raise ValueError(f"unknown chart_id: {chart_id}")
    return directory
