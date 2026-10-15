# @researchos/graph

ResearchOS 知识图谱内核：Markdown/LaTeX 双链解析、SQLite 边表存储、Graph RAG（向量召回 + k-hop 扩展 + 上下文打包）、布局坐标持久化。按 `.sisyphus/tmp-02-graph-original.md` 的 SQLite 设计实施（`docs/modules/02-knowledge-graph.md` 的 Neo4j 重写版未采纳）。

## 存储

- 图谱库：`<project>/.researchos/graph/graph.db`（与文献库 `.researchos/literature/literature.db` 同级；`docs/dependency-inventory.md` 中的 `.researchos/graph.db` 为旧路径，以本文件为准）。
- 嵌入模型缓存：`<project>/.researchos/graph/models/`。
- 表：`nodes`（paper/note/concept/repo）+ `edges`（cites/mentions/implements/evolves）+ `node_fts`（FTS5）+ `node_vec`（vec0，sqlite-vec 加载失败时整体降级为 FTS-only，`vecAvailable=false` 不抛错）。
- ID 约定：`paper:<doi-slug>` / `note:<vault 相对路径>` / `concept:<slug>` / `repo:<host>/<owner>/<name>`。

## 公开 API

```ts
import { openStore, parseFile, graphRag, createEmbedder, circleLayout } from "@researchos/graph"
```

- `openStore(projectRoot)` → `Store`（Kuzu 升级预留接口）：`upsertNodes/upsertEdges/removeBySource/replaceBySource/neighbors/search/all/getNode/upsertEmbedding/knn/saveLayout/resolveCiteKey/paperMeta/close`。
- `parseFile({ path, content, citeKeyToPaperId?, existingNode? })`：`[[wikilink]]`（含 alias/heading）与 `\cite{}` 解析；指向 paper 目标的边记 cites，其余默认 mentions。
- `graphRag(question, scope, store, embedder)` → `{ subgraph, contextPack, seeds, degraded }`；不生成 answer 文本（由调用方基于 contextPack 作答）。
- `citeKeyResolver(projectRoot)` → `CiteKeyResolver`：加载一次文献索引快照供整批解析复用；近似策略为 DOI 规范化 > arXiv ID（忽略 vN 版本后缀）> bibtex key 惯例（作者姓 + 年份 + 标题首词），查不到返回 `undefined` 降级。解析节点 id 固定为 `paper:<文献库 id>`，与读时合并的 literatureSubgraph 一致；`Store.resolveCiteKey` 为单 key 便捷封装。
- `src/mcp.ts`：MCP stdio server（`parse_wikilinks`/`upsert`/`query`/`layout` 四工具），`RESEARCHOS_PROJECT_ROOT` 定位项目根（默认 `process.cwd()`）。

## 测试

```bash
cd packages/researchos-graph
npx -y bun@1.3.14 test        # 全部离线；MCP 用 InMemoryTransport roundtrip
npx -y bun@1.3.14 typecheck
```
