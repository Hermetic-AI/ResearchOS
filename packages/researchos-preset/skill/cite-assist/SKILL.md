---
name: cite-assist
description: Find and insert evidence-backed citations using only the ResearchOS literature library. Use when the user asks for citation recommendations, a BibTeX entry, support for a claim, or insertion of a LaTeX cite command.
---

# Citation Assistant

1. Extract the claim and 2-5 discriminating search terms from the current paragraph.
2. Search with `literature_search`; inspect metadata before recommending a paper. Never invent papers, cite keys, DOI values, authors, or BibTeX fields.
3. Explain relevance using only returned metadata. If evidence is insufficient, say so and broaden the library search explicitly.
4. After approval, call `bibtex_from_library` with the paper ID, then `bibtex_upsert` for the project `.bib` file.
5. Insert `\cite{key}` only after BibTeX resolution succeeds. If no `.bib` file exists, ask where to create one.
6. Record the accepted or rejected recommendation with `suggest_record`.
