"""data.chart: academic matplotlib/seaborn rendering with themed rcParams."""

import json

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

THEMES = {
    "nature": {
        "font.family": "sans-serif",
        "font.size": 7,
        "axes.linewidth": 0.5,
        "figure.figsize": (3.5, 2.6),
        "axes.grid": True,
        "grid.linewidth": 0.3,
    },
    "ieee": {
        "font.family": "serif",
        "font.size": 8,
        "axes.linewidth": 0.6,
        "figure.figsize": (3.5, 2.2),
        "axes.grid": False,
    },
}

KINDS = ("line", "bar", "scatter", "hist", "box", "heatmap", "pair")


def render(frame: pd.DataFrame, kind: str, spec: dict) -> plt.Figure:
    if kind not in KINDS:
        raise ValueError(f"unsupported chart kind: {kind}")
    theme = spec.get("theme", "nature")
    if theme not in THEMES:
        raise ValueError(f"unknown theme: {theme}")
    with matplotlib.rc_context(THEMES[theme]):
        figure, ax = plt.subplots()
        x, y, hue = spec.get("x"), spec.get("y"), spec.get("hue")
        if kind == "line":
            sns.lineplot(data=frame, x=x, y=y, hue=hue, ax=ax)
        if kind == "bar":
            sns.barplot(data=frame, x=x, y=y, hue=hue, ax=ax)
        if kind == "scatter":
            sns.scatterplot(data=frame, x=x, y=y, hue=hue, ax=ax)
        if kind == "hist":
            sns.histplot(data=frame, x=x or y, hue=hue, ax=ax)
        if kind == "box":
            sns.boxplot(data=frame, x=x, y=y, hue=hue, ax=ax)
        if kind == "heatmap":
            numeric = frame.select_dtypes("number")
            sns.heatmap(numeric.corr(), annot=True, fmt=".2f", ax=ax)
        if kind == "pair":
            numeric = frame.select_dtypes("number")
            grid = sns.pairplot(numeric)
            figure = grid.figure
        if spec.get("title"):
            ax.set_title(str(spec["title"]))
        if spec.get("xlabel"):
            ax.set_xlabel(str(spec["xlabel"]))
        if spec.get("ylabel"):
            ax.set_ylabel(str(spec["ylabel"]))
        figure.tight_layout()
    return figure


def latex_snippet(main_path: str, spec: dict) -> str:
    caption = str(spec.get("title", "")).replace("_", "\\_")
    label = str(spec.get("label", "fig:result"))
    return "\n".join(
        [
            "\\begin{figure}[t]",
            "  \\centering",
            f"  \\includegraphics[width=\\columnwidth]{{{main_path}}}",
            *( [f"  \\caption{{{caption}}}"] if caption else [] ),
            f"  \\label{{{label}}}",
            "\\end{figure}",
        ]
    )


def spec_json(kind: str, spec: dict, fmt: str, dpi: int) -> str:
    return json.dumps({"kind": kind, "spec": spec, "format": fmt, "dpi": dpi}, ensure_ascii=False)
