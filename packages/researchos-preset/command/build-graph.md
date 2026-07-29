---
description: Rebuild the project knowledge graph from notes and citations
---

Scan the project's Markdown and LaTeX sources, call `graph.parse_wikilinks`, and pass the resulting nodes and edges to `graph.upsert`.
