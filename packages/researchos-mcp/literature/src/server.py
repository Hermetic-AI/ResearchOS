import json
import os
import subprocess
from pathlib import Path

from mcp.server import FastMCP

mcp = FastMCP("researchos-literature")

PACKAGE_ROOT = Path(__file__).resolve().parents[3]
CLI = PACKAGE_ROOT / "researchos-literature" / "src" / "cli.ts"


def _run(command: str, payload: dict[str, object]) -> object:
    process = subprocess.run(
        [os.environ.get("BUN_PATH", "bun"), "run", str(CLI), command],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=Path(os.environ.get("RESEARCHOS_PROJECT_ROOT", Path.cwd())).resolve(),
        timeout=120,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or f"Literature core exited with {process.returncode}")
    return json.loads(process.stdout)


@mcp.tool()
def literature_search(
    query: str,
    sources: list[str] | None = None,
    limit: int = 20,
) -> object:
    """Search four academic sources, deduplicate results, and persist them in the project library."""
    return _run(
        "search",
        {
            "query": query,
            "sources": sources or ["arxiv", "semantic_scholar", "crossref", "pubmed"],
            "limit": limit,
        },
    )


@mcp.tool()
def literature_get_metadata(paper_id: str) -> object:
    """Read one real paper record from the project-local literature database."""
    result = _run("get", {"id": paper_id})
    if isinstance(result, dict):
        result["researchos.ui"] = {"panel": "literature", "resource": paper_id, "mode": "auto"}
    return result


@mcp.tool()
def literature_export(paper_ids: list[str], format: str = "bibtex", style: str | None = None) -> object:
    """Export stored papers as bibtex, ris, endnote, json, or markdown.

    style is optional (ieee|acm|apa|nature|springer): when combined with
    format="markdown", the output is a numbered reference list rendered by the
    corresponding CSL style; other formats ignore it.
    """
    payload: dict[str, object] = {"paperIds": paper_ids, "format": format}
    if style:
        payload["style"] = style
    return _run("export", payload)


@mcp.tool()
def literature_import_pdf(path: str | None = None, url: str | None = None) -> object:
    """Import a PDF into the project library.

    Exactly one of path or url is required. path must stay inside the project
    workspace (the core rejects paths escaping the project root); url must be
    http/https. The import extracts the DOI from the PDF, enriches metadata
    online via Crossref/Semantic Scholar when possible, archives the file under
    .researchos/literature/pdfs/, and parses the reference section into
    citation edges.
    """
    if not path and not url:
        raise ValueError("literature_import_pdf requires path or url")
    return _run("import", {key: value for key, value in {"path": path, "url": url}.items() if value})


@mcp.tool()
def literature_get_citations(paper_id: str, direction: str) -> object:
    """List references or citing papers of a paper.

    direction must be "references" (papers this paper cites) or "cited_by"
    (papers citing it). Entries include title/year/doi when known, the edge
    source (pdf|grobid|semantic_scholar), and whether the paper is in the
    local library.
    """
    if direction not in ("references", "cited_by"):
        raise ValueError("direction must be 'references' or 'cited_by'")
    return _run("citations", {"paperId": paper_id, "direction": direction})


@mcp.tool()
def literature_recommend_similar(paper_id: str, limit: int = 10) -> object:
    """Recommend similar papers from the project library.

    Ranks by local abstract-embedding KNN plus a co-citation bonus. When the
    sqlite-vec extension or the embedding model is unavailable, ranking falls
    back to keyword overlap and the result carries degraded=true.
    """
    return _run("recommend", {"paperId": paper_id, "limit": limit})


@mcp.tool()
def literature_read(paper_id: str, query: str, k: int = 6) -> object:
    """Semantic retrieval over one paper's full text.

    Returns the top-k chunks matching the query, each carrying its section
    name (e.g. "2 Methods") so answers can cite where a claim comes from.
    Prefer this over reading the whole PDF. When the sqlite-vec extension or
    the embedding model is unavailable, ranking falls back to keyword overlap
    and the result carries degraded=true; when no full text is available for
    the paper, sections is empty with reason="no-fulltext".
    """
    result = _run("read", {"paperId": paper_id, "query": query, "k": k})
    if isinstance(result, dict):
        result["researchos.ui"] = {"panel": "literature", "resource": paper_id, "mode": "badge"}
    return result


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
