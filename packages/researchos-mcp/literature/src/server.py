from mcp.server import FastMCP

mcp = FastMCP("researchos-literature")


@mcp.tool()
def literature_search(query: str, sources: str = "arxiv,semantic_scholar,crossref,pubmed", limit: int = 20) -> dict:
    """Search academic papers across arXiv, Semantic Scholar, Crossref, and PubMed.

    Returns a unified list of SearchResult objects with deduplication.
    """
    src_list = [s.strip() for s in sources.split(",")]
    return {"results": [], "sources": src_list, "query": query, "limit": limit, "note": "MCP stub - connect to @researchos/api-hub"}


@mcp.tool()
def literature_import_pdf(path: str) -> dict:
    """Import a PDF into the local literature database. Extracts metadata (title, authors, DOI, abstract)."""
    return {"paper_id": f"stub:{path}", "title": "PDF import stub", "note": "MCP stub"}


@mcp.tool()
def literature_export(paper_ids: list[str], format: str = "bibtex", style: str = "ieee") -> dict:
    """Export papers in bibtex, ris, endnote, json, or markdown format."""
    return {"content": f"Export stub for {len(paper_ids)} papers in {format} format", "format": format, "style": style}


def main():
    mcp.run()


if __name__ == "__main__":
    main()
