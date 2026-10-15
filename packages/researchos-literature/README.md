# @researchos/literature

Project-local literature management for ResearchOS.

The implemented core path searches arXiv, Semantic Scholar, Crossref, and PubMed through `@researchos/api-hub`, normalizes and merges records by DOI/arXiv ID/title, and lazily upserts the result with ordered authors into `.researchos/literature/literature.db`. The service also provides local listing, metadata lookup, and BibTeX/RIS/EndNote/JSON/Markdown export.

PDF import extracts full text (persisted to `.researchos/literature/text/<paperId>.txt`), parses references into citation edges, embeds abstracts, and chunks + embeds full-text sections (`paper_chunk` / `paper_chunk_embedding`) for the `read` retrieval API (semantic KNN with explicit keyword-fallback degradation). Zotero import is also implemented.

Remaining later milestones from `docs/modules/01-literature.md` must not be presented as complete beyond the above.

Run validation from this directory:

```sh
bun typecheck
bun test
```
