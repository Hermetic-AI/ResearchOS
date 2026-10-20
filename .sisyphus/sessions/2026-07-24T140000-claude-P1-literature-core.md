---
agent: "claude-sonnet-4"
tool: "Claude Code (opencode)"
session_start: "2026-07-24T14:00:00+08:00"
session_end: "2026-07-24T14:45:00+08:00"
phase: "P1"
task: "literature-core-package"
branch: "dev"
status: "completed"
files_created:
  - "packages/researchos-literature/package.json"
  - "packages/researchos-literature/tsconfig.json"
  - "packages/researchos-literature/src/index.ts"
  - "packages/researchos-literature/src/paths.ts"
  - "packages/researchos-literature/src/types.ts"
  - "packages/researchos-literature/src/schema.ts"
  - "packages/researchos-literature/src/db.ts"
  - "packages/researchos-literature/src/search.ts"
  - "packages/researchos-literature/src/import.ts"
  - "packages/researchos-literature/src/export.ts"
  - "packages/researchos-literature/test/literature.test.ts"
files_modified: []
checks_passed:
  - "bun test (packages/researchos-literature) — 9 pass, 0 fail"
checks_failed: []
next_steps:
  - "P1.6: protocol group researchos-literature.ts + server handler + client regenerate"
  - "P1.7: 前端三栏文献库页面（pages/literature/）"
  - "P2: 知识图谱中心 @researchos/graph"
---

## 完成内容

P1 @researchos/literature 核心包开发完成。

1. **DB schema** — 9 张表（paper, author, paper_author, tag, paper_tag, collection, paper_collection, citation_edge, external_paper）+ vec0 虚拟表预留
2. **LiteratureDB** — 完整的 CRUD：insert/get/list/searchLocal，自动建目录 + WAL 模式
3. **搜索服务** — 四源 HTTP API 并行检索 + 去重（DOI/arXivId/标题），集成 @researchos/api-hub
4. **导入** — computePaperId（8 字符 hex hash）、PDF 元数据正则提取（DOI/标题/年份）
5. **导出** — BibTeX/RIS/EndNote/Markdown 四种格式
6. **9 个测试全部通过** — 覆盖 DB CRUD、本地搜索、PDF 元数据解析、四种导出格式

## 关键决策

1. 使用 raw `bun:sqlite`（非 Drizzle ORM），与模块文档 §5 的 SQL DDL 一致
2. vec0 虚拟表在 sqlite-vec 扩展未加载时跳过（降级），推荐功能 soft-fail
3. 搜索去重：优先 DOI → arXivId → 小写标题，确保不会因格式差异重复
4. `computePaperId`: 使用 `Math.imul(31, h)` 循环 hash（32 位）→ hex → pad 8 位，短小且确定性好

## 遗留问题

- protocol group 和 server handler 未创建（需参照 P0.1 模式追加）
- 前端三栏页面未创建
- GROBID 集成预留（当前仅规则解析 DOI/标题/年份）
- similarity 推荐功能（需 sqlite-vec 扩展已加载时才能使用 vec0）

## 给下一个 Agent 的上下文

- 使用方式：`const db = new LiteratureDB("/project/root"); await db.init(); db.insertPaper(paper);`
- 搜索：`import { search } from "@researchos/literature"; await search("attention mechanism", { sources: ["arxiv", "semantic_scholar"] })`
- API Hub 的 adapter 已在 search.ts 中注册（arxiv, S2, crossref, pubmed）
