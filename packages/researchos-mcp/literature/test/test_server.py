import os
from pathlib import Path

import pytest

from src import server
from src.server import _run


def test_python_bridge_calls_typescript_core(tmp_path: Path) -> None:
    assert os.environ.get("BUN_PATH"), "BUN_PATH must point to the Bun executable for the bridge test"
    os.environ["RESEARCHOS_PROJECT_ROOT"] = str(tmp_path)
    assert _run("export", {"paperIds": ["missing"], "format": "bibtex"}) == {
        "content": "",
        "format": "bibtex",
    }
    assert (tmp_path / ".researchos" / "literature" / "literature.db").is_file()


def test_citations_bridge_returns_empty_for_fresh_library(tmp_path: Path) -> None:
    assert os.environ.get("BUN_PATH"), "BUN_PATH must point to the Bun executable for the bridge test"
    os.environ["RESEARCHOS_PROJECT_ROOT"] = str(tmp_path)
    assert _run("citations", {"paperId": "missing", "direction": "references"}) == {"results": []}


def test_import_pdf_requires_path_or_url() -> None:
    with pytest.raises(ValueError, match="path or url"):
        server.literature_import_pdf()


def test_import_pdf_maps_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(server, "_run", lambda command, payload: calls.append((command, payload)))
    server.literature_import_pdf(path="papers/a.pdf")
    server.literature_import_pdf(url="https://example.com/a.pdf")
    assert calls == [
        ("import", {"path": "papers/a.pdf"}),
        ("import", {"url": "https://example.com/a.pdf"}),
    ]


def test_get_citations_validates_direction() -> None:
    with pytest.raises(ValueError, match="direction"):
        server.literature_get_citations("p1", " sideways")


def test_get_citations_maps_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(server, "_run", lambda command, payload: calls.append((command, payload)))
    server.literature_get_citations("p1", "cited_by")
    assert calls == [("citations", {"paperId": "p1", "direction": "cited_by"})]


def test_export_passes_style_only_when_given(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(server, "_run", lambda command, payload: calls.append((command, payload)))
    server.literature_export(["p1"], format="markdown", style="ieee")
    server.literature_export(["p1"])
    assert calls == [
        ("export", {"paperIds": ["p1"], "format": "markdown", "style": "ieee"}),
        ("export", {"paperIds": ["p1"], "format": "bibtex"}),
    ]


def test_recommend_similar_maps_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(server, "_run", lambda command, payload: calls.append((command, payload)))
    server.literature_recommend_similar("p1")
    server.literature_recommend_similar("p2", limit=25)
    assert calls == [
        ("recommend", {"paperId": "p1", "limit": 10}),
        ("recommend", {"paperId": "p2", "limit": 25}),
    ]
