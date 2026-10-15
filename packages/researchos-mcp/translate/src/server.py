import json
import os
import re
import sys
from pathlib import Path

import fitz
from mcp.server import FastMCP

mcp = FastMCP("researchos-translate")


def resolve_pdf(pdf_path: str) -> Path:
    root = Path(os.environ.get("RESEARCHOS_PROJECT_ROOT", Path.cwd())).resolve()
    path = (root / pdf_path).resolve()
    if path != root and root not in path.parents:
        raise ValueError("PDF path escapes project root")
    if path.suffix.lower() != ".pdf" or not path.is_file():
        raise ValueError(f"PDF not found: {pdf_path}")
    return path


def extract_pdf(pdf_path: str) -> dict:
    blocks = []
    with fitz.open(resolve_pdf(pdf_path)) as document:
        for page_number, page in enumerate(document, 1):
            for block in page.get_text("blocks", sort=True):
                text = re.sub(r"\s+", " ", block[4]).strip()
                if not text:
                    continue
                kind = "heading" if len(text) < 120 and (text.isupper() or re.match(r"^\d+(\.\d+)*\s+", text)) else "caption" if re.match(r"^(Fig\.?|Figure|Table)\s+\d+", text, re.IGNORECASE) else "formula" if len(text) < 100 and sum(char in "=∫∑∂√≤≥≈" for char in text) >= 2 else "paragraph"
                blocks.append({"kind": kind, "text": text, "page": page_number, "bbox": list(block[:4])})
    if not blocks:
        raise ValueError("PDF has no extractable text layer; OCR is not included")
    return {"blocks": blocks, "pages": max(block["page"] for block in blocks)}


@mcp.tool()
def translate_extract_pdf(pdf_path: str) -> dict:
    """Extract ordered text blocks from a project PDF using PyMuPDF."""
    result = extract_pdf(pdf_path)
    result["researchos.ui"] = {"panel": "translate", "resource": pdf_path, "mode": "badge"}
    return result


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "extract":
        print(json.dumps(extract_pdf(sys.argv[2]), ensure_ascii=False))
        return
    mcp.run()


if __name__ == "__main__":
    main()
