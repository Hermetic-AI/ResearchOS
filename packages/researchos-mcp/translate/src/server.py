from mcp.server import FastMCP

mcp = FastMCP("researchos-translate")


@mcp.tool()
def translate_extract_pdf(pdf_path: str) -> dict:
    """Extract structured text from a PDF using PyMuPDF. Returns sections with block-level classification."""
    return {"paper_id": f"stub:{pdf_path}", "sections": [], "note": "MCP stub - requires PyMuPDF"}


@mcp.tool()
def translate_run(paper_id: str, sections: list[str] | None = None, engine: str = "auto") -> dict:
    """Run the full EN→ZH translation pipeline: extract → API translate → LLM polish."""
    sections = sections or ["abstract"]
    return {"paper_id": paper_id, "sections": [], "glossary": [], "note": "MCP stub - requires translation API"}


def main():
    mcp.run()


if __name__ == "__main__":
    main()
