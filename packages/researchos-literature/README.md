# @researchos/literature

Project-local literature management for ResearchOS.

The implemented core path searches arXiv, Semantic Scholar, Crossref, and PubMed through `@researchos/api-hub`, normalizes and merges records by DOI/arXiv ID/title, and lazily upserts the result with ordered authors into `.researchos/literature/literature.db`. The service also provides local listing, metadata lookup, and BibTeX/RIS/EndNote/JSON/Markdown export.

PDF extraction, Zotero import, citation graph extraction, and similarity recommendations remain later milestones from `docs/modules/01-literature.md`; callers must not present those as complete.

Run validation from this directory:

```sh
bun typecheck
bun test
```
