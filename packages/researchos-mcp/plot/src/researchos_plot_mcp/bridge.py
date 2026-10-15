"""One-shot JSON bridge used by the ResearchOS HTTP server."""

import json
import sys

from .paths import project_root
from .service import annotate_significance, chart_create, chart_tune


def dispatch(request: dict) -> dict:
    operation = request.get("operation")
    payload = request.get("payload")
    if not isinstance(payload, dict):
        raise TypeError("payload must be an object")
    root = project_root()
    if operation == "create":
        return chart_create(
            root,
            str(payload["template"]),
            dict(payload["data"]),
            str(payload.get("theme", "nature")),
            dict(payload["spec"]) if payload.get("spec") is not None else None,
        )
    if operation == "tune":
        return chart_tune(root, str(payload["chart_id"]), dict(payload["patch"]))
    if operation == "annotate":
        return annotate_significance(
            root,
            str(payload["chart_id"]),
            str(payload.get("test", "ttest")),
            [list(pair) for pair in payload.get("groups", [])],
        )
    raise ValueError(f"unsupported plot bridge operation: {operation}")


def main() -> None:
    request = json.load(sys.stdin)
    json.dump(dispatch(request), sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
