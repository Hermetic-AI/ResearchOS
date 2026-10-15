# ResearchOS implementation status

Last reviewed: 2026-08-09.

The active implementation uses the packages and HTTP handlers in this repository as the source of truth. The module documents are design specifications; they are not all implementation-complete.

## Frontend / interaction (packages/app)

| Area | Current state | Important runtime requirement or gap |
| --- | --- | --- |
| Workspace shell | Unified `ModuleState` vocabulary, health-aggregating status bar, collapsible context panel, Agent Dock as persistent inline chat | Health is probed frontend-side per service; no unified backend health endpoint. |
| Navigation | Research modules are native sidebar citizens (icon rail + panel Research section with real counts); project lands on `/overview` | Counts come from per-module probes; failed probes render nothing. |
| Chat ↔ literature | `@paper` mention in composer (PDF file part or metadata text), paper-scoped dock sessions, related-chats index, reading-note → `notes/literature/*.md` → graph indexing | `citeKey`/`pdf_path` are not protocol fields; PDF located by directory convention, cite key shown as paper id. |
| Module states | Literature/graph/assets/data/reproduce top-level states use `ModuleState` with real retry/guidance | translate/latex/plot keep local partial states by design (documented in `docs/researchos-product-design.md`). |
| E2E acceptance | `e2e/researchos/workspace-smoke.spec.ts` + `fusion-flows.spec.ts` (dock 提问→相关会话、图谱深链 miss/hit) | 本机 3 passed（2026-08-10，真实后端 + 系统 Edge 经 `PLAYWRIGHT_EXECUTABLE_PATH`；chromium CDN 在此网络不可达）。8.3 短路径目录会挂起导入（见下）。 |

Design documents: `docs/researchos-product-design.md` (P1–P4), `docs/chat-literature-integration.md` (L0–L3). Backend items still open: protocol `citeKey`/`pdf_path` fields, preset install covering agents (not only the `mcp` block), SystemContext library/selection sources (L2), full-text persistence and vector-path unlock (L3).

Fixed (2026-08-10): ① wikilink cite-key resolution is now wired into production paths — `graph.reindex` and graph MCP pass a `citeKeyResolver` snapshot to `parseFile`; resolver node ids normalized to `paper:<literature-id>` (matching the read-time `literatureSubgraph` merge, no duplicate paper nodes) and arXiv matching is version-insensitive; any source linking a paper produces a `cites` edge. Covered by `packages/researchos-graph/test/citekey.test.ts` (4 tests). Follow-up noted: frontmatter-DOI self-node ids (`paper:<doi-slug>`, wikilink.ts:33) still differ from `paper:<literature-id>`. ② Windows 8.3 short-path hang — `DirectoryDataProvider` now gates routed content until the canonical directory is known (redirect happens before any mount); regression coverage in `e2e/researchos/dir-canonical-repro.spec.ts`.


| Area | Current state | Important runtime requirement or gap |
| --- | --- | --- |
| Literature | Implemented and tested | External search depends on the configured academic APIs. |
| Knowledge graph | SQLite graph, FTS/vector-degraded RAG, MCP, and UI are implemented | `02-knowledge-graph.md` is a future Neo4j/LadybugDB proposal and is not the current backend. |
| LaTeX | Editor, diagnostics, storage, and MCP are implemented | PDF compilation requires a Tectonic binary. |
| Data analysis | Store, Python kernel/MCP, and UI are implemented | Requires `uv` and the data MCP environment. |
| Paper writing | Conversion, diff, citation helpers, plugin, and sidebar are implemented | Model-authored prose remains an agent/model responsibility. |
| Plot | Chart templates, Mermaid/Graphviz/draw.io artifacts, MCP, and UI are implemented | Python chart rendering requires the plot MCP environment. |
| Reproduction | Durable six-step pipeline and local execution are implemented | Repository/environment compatibility is intentionally project-specific. |
| Translation | PDF extraction, LibreTranslate pipeline, archive, and UI are implemented | Requires `LIBRETRANSLATE_URL`; LLM polishing and automatic glossary extraction are not implemented in the TS service. |
| Asset center / API hub | Asset UI, preset install, API cache/rate-limit adapters are implemented | The preset now registers all seven ResearchOS MCP servers. |

Use the package tests and `packages/client` generated-client check as the acceptance baseline. A feature must not be described as available merely because its UI route or package exists.
