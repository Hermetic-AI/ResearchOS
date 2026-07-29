from copy import deepcopy

TEMPLATES = ("grouped_bar", "scatter_regression", "boxplot", "violin", "survival", "heatmap")
THEME_NAMES = ("nature", "science", "ieee", "prism")


def build_spec(template: str, data: dict, theme: str, patch: dict | None = None) -> dict:
    if template not in TEMPLATES:
        raise ValueError(f"unsupported template: {template}")
    if theme not in THEME_NAMES:
        raise ValueError(f"unsupported theme: {theme}")
    if ("file" in data) == ("inline" in data):
        raise ValueError("data must contain exactly one of: file, inline")
    result = {
        "template": template,
        "theme": theme,
        "data": data,
        "encoding": {},
        "axes": {"tick_font_size": 7},
        "legend": {"show": True, "position": "best"},
        "annotations": [],
    }
    result = deep_merge(result, patch or {})
    validate_spec(result)
    return result


def validate_spec(spec: dict) -> None:
    encoding = spec.get("encoding", {})
    if spec["template"] != "heatmap" and not encoding.get("x"):
        raise ValueError("spec.encoding.x is required")
    if spec["template"] != "heatmap" and not encoding.get("y"):
        raise ValueError("spec.encoding.y is required")
    if spec["template"] not in TEMPLATES or spec["theme"] not in THEME_NAMES:
        raise ValueError("invalid template or theme")
    if not isinstance(spec.get("annotations"), list):
        raise TypeError("spec.annotations must be a list")


def deep_merge(base: dict, patch: dict) -> dict:
    result = deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def stars_for_p(p_value: float) -> str:
    if p_value < 0.001:
        return "***"
    if p_value < 0.01:
        return "**"
    if p_value < 0.05:
        return "*"
    return "ns"
