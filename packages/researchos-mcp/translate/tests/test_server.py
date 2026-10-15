import sys
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from server import extract_pdf


def test_extract_pdf_returns_real_ordered_blocks(tmp_path: Path, monkeypatch):
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "1 Introduction", fontsize=16)
    page.insert_text((72, 110), "A reproducible scientific paragraph.")
    document.save(tmp_path / "paper.pdf")
    monkeypatch.setenv("RESEARCHOS_PROJECT_ROOT", str(tmp_path))
    result = extract_pdf("paper.pdf")
    assert result["pages"] == 1
    assert any("Introduction" in block["text"] for block in result["blocks"])


def test_extract_pdf_rejects_project_escape(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("RESEARCHOS_PROJECT_ROOT", str(tmp_path))
    try:
        extract_pdf("../outside.pdf")
    except ValueError as error:
        assert "escapes" in str(error)
    else:
        raise AssertionError("project escape was accepted")
