# 模块二：知识图谱中心（Knowledge Graph）技术落地文档

> 对应总体方案 `docs/ResearchOS最终方案.md` 模块二 / 接口 5.2 节；UI 对应 `docs/ResearchOS-UI设计.md` 3.4 节。
> 形态：**`@researchos/graph` 新包 + MCP server + plugin 事件钩子 + SubAgent/Skill + app 全屏图谱页面**。不侵入 OpenCode 核心。

---

## 1. 模块概述与目标

知识图谱中心把研究课题内的 Markdown/LaTeX 笔记、文献库条目、概念与代码仓库编织成一张本地优先的关联图谱：通过 `[[...]]` 双链解析与 `\cite{}` 引用解析自动建边，节点（paper/note/concept/repo）与边（cites/mentions/implements/evolves）持久化在课题级 SQLite 边表中，前端提供力导向图全屏画布 + 节点详情抽屉 + Graph RAG 提问条，Agent 侧通过 MCP tool 完成解析、写入与语义查询，并在 AI 阅读论文后由 Knowledge Graph SubAgent 自动挂载概念节点。目标是让"文献 ↔ 笔记 ↔ 概念 ↔ 代码"的关联网络既可视化、可被 Agent 检索（Graph RAG），又保持全部数据本地、可 Git 化、可审查。

## 2. 功能清单与范围边界

**做（本期）：**

- Markdown `[[wikilink]]` 与 LaTeX `\cite{bibkey}` 双链/引用解析，输出节点与边。
- 图谱存储：课题级 SQLite 边表（`vault/.researchos/graph.db`），节点四类、边四类，含位置持久化与 FTS5 全文索引。
- 可视化：app 内全屏 canvas 图谱（d3-force 起步），按类型着色、按关系区分线型，缩放/拖拽/hover 邻居高亮，布局切换（力导/环形）。
- Graph RAG：向量召回节点 → k-hop 子图扩展 → 上下文打包，供 Agent/前端提问条消费。
- 自动建链：plugin 事件钩子监听笔记/文献文件变更自动重解析；`graph` SubAgent 在 AI 阅读论文后自动创建概念节点与 mentions/implements 边。

**不做（明确排除，留待后续）：**

- 不上 Kuzu：SQLite 边表达不到性能瓶颈（单课题 < 5 万边）前不引入嵌入式图库，仅预留存储接口抽象。
- 不做实时协同编辑图谱、不做服务端多用户共享。
- 不做 PDF 正文级概念抽取（依赖 GROBID 的深度解析属文献模块增强项，本模块只消费文献模块已入库的元数据与笔记文本）。
- 不做图谱版本管理 UI（底层文件可 Git，UI 不提供时间轴回放）。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 图数据核心库 | 自研 `@researchos/graph`（TypeScript） | 数据模型简单（节点表+边表），自研可控，无黑盒 | MIT（自有） |
| SQLite 驱动 | `bun:sqlite` | Bun 内置，零依赖，与 repo 全仓 Bun 技术栈一致 | 内置 |
| 全文索引 | SQLite FTS5 | 内置扩展，笔记正文检索免引入额外引擎 | 内置 |
| 向量检索 | `sqlite-vec` | 与图谱同库、本地嵌入、无独立向量服务；AGENTS.md 总体方案既定选型 | MIT |
| Markdown 解析 | `remark-parse`（unified 生态） | AST 级解析 `[[...]]` 与标题/frontmatter，比纯正则健壮 | MIT |
| MCP SDK | `@modelcontextprotocol/sdk` | repo 已依赖（见 `patches/@modelcontextprotocol%2Fsdk`），stdio server 标准实现 | MIT |
| 可视化（MVP） | `d3-force` + `d3-zoom`（SVG 渲染） | 节点 < 2k 时开发最快，样式可直接用 Tailwind/主题令牌，力导/环形布局切换容易 | ISC |
| 可视化（扩展路径） | Sigma.js + graphology + forceatlas2 | 节点规模上万时换 WebGL 渲染，接口层预留替换点 | MIT |
| 本地嵌入 | `@huggingface/transformers`（transformers.js，如 all-MiniLM-L6-v2） | 纯本地、Node/Bun 可跑；也可用 OpenCode 已配置的 provider embedding 作为备选 | Apache-2.0 |
| 图库（扩展路径） | Kuzu | 总体方案既定的 SQLite→Kuzu 升级路径，本期只留接口不引入 | MIT |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| 解析 / 存储 / 查询核心逻辑 | 新 package `packages/researchos-graph`（`@researchos/graph`） | 纯函数 + SQLite 访问，需同时被 MCP server、plugin、server handler 三方复用，必须独立成包；依赖方向只向 Schema/Protocol 看齐，不依赖 Core/Server |
| `graph.parse_wikilinks` / `graph.upsert` / `graph.query` / `graph.layout` | MCP server（`researchos-graph`，stdio，opencode.json `mcp` 键声明） | Agent 消费图谱能力的标准通道；sqlite-vec/transformers 等重依赖隔离在独立子进程，不拖慢主进程；MCP 工具以 `researchos-graph_*` 暴露给模型 |
| 文件变更自动重解析 | plugin `.opencode/plugin/graph-autolink.ts`（`event` hook） | 自动建链需要在 OpenCode 会话内监听文件写入事件，plugin 是唯一事件入口；plugin 为 in-process TS，直接 `import` `@researchos/graph` 的 parse/upsert 函数，无需绕道 MCP |
| AI 阅读后自动建链的编排 | SubAgent `.opencode/agent/graph.md` | 阅读论文 → 抽取概念 → 调 `researchos-graph_upsert` 挂载节点/边，是一段 prompt 编排逻辑，声明式 agent 最贴切；经内置 TaskTool 被主会话或其他 SubAgent 调用 |
| Graph RAG 提问范式 | Skill `.opencode/skill/graph-rag/SKILL.md` | "先向量召回再 k-hop 扩展再作答"是可复用的操作手册，Skill 教任意 agent 正确使用 graph 工具，经内置 SkillTool 暴露 |
| 前端读取图谱数据（画布/抽屉/RAG 条） | 服务端 HttpApiGroup `server.graph` + `packages/app` 路由页 `/graph` | 前端进程不能直连课题 SQLite（Desktop/Web 部署位置不同），必须走 Server HTTP；在 `packages/protocol/src/groups/graph.ts` 声明、`packages/server/src/handlers/graph.ts` 实现（复用 `@researchos/graph` 只读查询），`packages/client` 跑 `bun run generate` 生成客户端 |
| 图谱可视化页面 | app 前端路由页面 `packages/app/src/pages/graph.tsx` | 属 UI 新增面板，是 Fork 内允许的改动集中区；入口挂 `sidebar-shell.tsx` icon rail |

**为什么不把工具做成 plugin tool**：plugin `tool()` 与 MCP 都能向模型暴露工具，但图谱工具被 SubAgent、Skill、未来 CLI 多方调用，MCP server 是跨进程标准通道且隔离重依赖；plugin 只保留"事件钩子"这一 MCP 做不到的能力。

## 5. 数据模型与本地存储设计

### 5.1 Vault 目录约定（课题级）

```
<project>/
├── vault/                        # 研究课题知识库（可整体进 Git）
│   ├── papers/                   # 每篇文献一个 .md 笔记（含 frontmatter: doi, title...）
│   ├── notes/                    # 自由笔记
│   ├── concepts/                 # 概念页（自动建链产物，AI 可写）
│   └── .researchos/
│       ├── graph.db              # SQLite 图谱库（.gitignore）
│       └── embeddings.bin        # sqlite-vec 与 graph.db 同库，此文件预留
└── opencode.json                 # 声明 researchos-graph MCP server 与 agent/skill
```

### 5.2 节点 / 边 ID 约定

- `paper:<doi-slug>`，如 `paper:10.48550-arxiv.1706.03762`
- `note:<vault 相对路径>`，如 `note:notes/attention-survey.md`
- `concept:<slug>`，如 `concept:flash-attention`
- `repo:<host>/<owner>/<name>`，如 `repo:github.com/Dao-AILab/flash-attention`

### 5.3 SQLite DDL（`vault/.researchos/graph.db`）

```sql
-- 节点
CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,            -- 见 5.2 ID 约定
  type        TEXT NOT NULL CHECK (type IN ('paper','note','concept','repo')),
  label       TEXT NOT NULL,
  ref_id      TEXT,                        -- 关联外部实体：paper → 文献库 paper_id；repo → 本地路径
  source_path TEXT,                        -- 产生该节点的文件（note/concept 必填）
  attrs       TEXT NOT NULL DEFAULT '{}',  -- JSON：doi/year/venue/url 等弱 schema 字段
  x           REAL,                        -- 布局持久化坐标
  y           REAL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);

-- 边
CREATE TABLE IF NOT EXISTS edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL CHECK (relation IN ('cites','mentions','implements','evolves')),
  source_path TEXT,                        -- 产生该边的文件（便于文件删除时回收）
  context     TEXT,                        -- 边出现处的上下文片段（Graph RAG 用）
  created_at  INTEGER NOT NULL,
  UNIQUE (from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);

-- 笔记正文全文索引（Graph RAG 召回）
CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(
  node_id UNINDEXED,
  label,
  body,
  tokenize = 'unicode61'
);

-- 向量索引（sqlite-vec 加载后创建；未加载时 Graph RAG 退化为 FTS-only）
CREATE VIRTUAL TABLE IF NOT EXISTS node_vec USING vec0(
  node_id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);
```

**写入语义**：`upsert` 幂等——节点按 `id` 冲突更新 `label/attrs/updated_at`；边按 `(from_id, to_id, relation)` 唯一约束 `INSERT OR IGNORE`。文件级重解析采用"先删后插"：`DELETE FROM edges WHERE source_path = ?` 再插入新解析结果，保证笔记删除链接后边被回收。

**Kuzu 升级预留**：所有存储访问收敛在包内 `Store` 接口（`upsertNodes / upsertEdges / removeBySource / neighbors / search / all`），SQLite 实现为 `SqliteStore`；未来 `KuzuStore` 实现同一接口即可替换，MCP/HTTP/前端无感知。

## 6. 核心接口实现

包结构（`packages/researchos-graph`）：

```
src/
├── index.ts          # 公共出口：parse/upsert/query/layout + Store 接口
├── wikilink.ts       # remark AST 解析 [[...]]；LaTeX \cite{} 正则解析
├── store.ts          # Store 接口 + SqliteStore（bun:sqlite）
├── embed.ts          # transformers.js 嵌入 + sqlite-vec 写入（懒加载）
├── rag.ts            # Graph RAG：召回 → k-hop 扩展 → 上下文打包
├── layout.ts         # 坐标读取/持久化；环形布局计算（力导在前端跑）
└── mcp.ts            # MCP stdio server 入口
```

### 6.1 双链解析（`wikilink.ts`）

```ts
import { remark } from "remark"

export interface GraphNode {
  id: string
  type: "paper" | "note" | "concept" | "repo"
  label: string
  ref_id?: string
}

export interface GraphEdge {
  from: string
  to: string
  relation: "cites" | "mentions" | "implements" | "evolves"
  context?: string
}

// 解析单个 Markdown/LaTeX 文件，返回该文件声明的节点与边
export async function parseFile(input: {
  path: string        // vault 相对路径
  content: string
  citeKeyToPaperId?: (key: string) => string | undefined  // 由文献库提供 bibkey → paper_id 映射
}): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
```

实现要点：

- Markdown 走 `remark-parse` AST：frontmatter 取 `title`/`doi` 生成自身节点（`note:` 或 `paper:`）；遍历 `text` 节点用 `/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g` 提取 wikilink（兼容 `[[target|alias]]`、`[[target#heading]]`），目标解析顺序：文献库 bibkey/DOI 命中 → `paper:`，已存在概念 → `concept:`，已存在笔记路径 → `note:`，否则按 `concept:<slug>` 落新节点；`context` 取所在段落文本截断 200 字符。
- 边关系判定：`[[...]]` 默认 `mentions`；链接目标为 paper 且当前文件也是 paper 笔记时记 `cites`；`implements`/`evolves` 不由语法自动产生，仅由 SubAgent 显式 upsert（见第 7 节）。
- LaTeX 文件不走 AST：正则提取 `\cite{key1,key2}`，经 `citeKeyToPaperId` 映射生成 `cites` 边（from = 当前 tex 对应的 `note:` 节点）。
- 函数式数组方法 + 无 `any`，遵守 AGENTS.md。

### 6.2 MCP server（`mcp.ts`）

`opencode.json` 声明：

```json
{
  "mcp": {
    "researchos-graph": {
      "type": "local",
      "command": ["bun", "run", "packages/researchos-graph/src/mcp.ts"],
      "environment": { "RESEARCHOS_VAULT": "{workspaceFolder}/vault" }
    }
  }
}
```

四个 tool（暴露给模型时名称为 `researchos-graph_parse_wikilinks` 等），zod schema 与总体方案 5.2 节契约一一对应：

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({ name: "researchos-graph", version: "0.1.0" })
const store = openStore(process.env.RESEARCHOS_VAULT!)   // SqliteStore

server.registerTool("parse_wikilinks", {
  description: "Parse [[wikilinks]] and \\cite{} from Markdown/LaTeX files, returning graph nodes and edges",
  inputSchema: { paths: z.array(z.string()) },
}, async ({ paths }) => json(await parsePaths(paths, store)))

server.registerTool("upsert", {
  description: "Idempotently upsert graph nodes and edges into the knowledge graph",
  inputSchema: { nodes: z.array(nodeSchema), edges: z.array(edgeSchema) },
}, async (input) => json(store.upsert(input)))

server.registerTool("query", {
  description: "Graph RAG: semantic recall + k-hop subgraph expansion for a natural language question",
  inputSchema: {
    question: z.string(),
    scope: z.object({ center_node: z.string().optional(), depth: z.number().optional() }).optional(),
  },
}, async ({ question, scope }) => json(await graphRag(question, scope, store)))

server.registerTool("layout", {
  description: "Return nodes (with persisted x/y) and edges for frontend visualization",
  inputSchema: { filter: z.object({ type: z.string().optional() }).optional() },
}, async ({ filter }) => json(store.layout(filter)))

await server.connect(new StdioServerTransport())
```

### 6.3 Graph RAG（`rag.ts`）流程

```
1. 召回：question 经 embed.ts 生成向量 → node_vec topK=8；
   sqlite-vec 不可用时退化为 node_fts MATCH topK=8。
2. 扩展：以召回节点 + scope.center_node 为种子，BFS 扩展 depth（默认 1，最大 2）跳，
   收集子图 nodes/edges（单条 SQL 递归 CTE 或循环 neighbors 查询）。
3. 打包：每个命中节点取 label + edges.context 片段拼成 context pack（token 预算 4k）。
4. 返回 { subgraph, context_pack, seeds }。
   注意：answer 文本不在此处生成——MCP 工具只返回子图与上下文，
   由调用方（graph SubAgent / 前端 RAG 条背后的会话）基于 context_pack 作答并附来源引用。
   graph.query 出参中的 answer 字段由 server handler（6.4）在 HTTP 侧组装会话后填充。
```

### 6.4 服务端 HTTP 接口（前端用）

- `packages/protocol/src/groups/graph.ts`：新增 `GraphGroup = HttpApiGroup.make("server.graph")`，端点：
  - `graph.get`（GET `/api/graph`，query: `type?`）→ `{ nodes, edges }`（含 x/y）
  - `graph.node`（GET `/api/graph/node`，query: `id`）→ 节点详情 + 一度邻居 + 关联文献元数据
  - `graph.ask`（POST `/api/graph/ask`，body: `{ question, center_node?, depth? }`）→ `{ subgraph, answer, sources[] }`；handler 内部先跑 `graphRag` 拿 context_pack，再向 OpenCode 会话发一条注入上下文的 prompt 生成 answer（复用现有 session 能力，不在 graph 包内自建 LLM 调用）
  - `graph.save_layout`（POST `/api/graph/layout`，body: `[{ id, x, y }]`）→ 持久化前端拖拽后的坐标
- 在 `packages/protocol/src/api.ts` 注册 `GraphGroup`；handler 写 `packages/server/src/handlers/graph.ts`（读侧直接 `import { openStore } from "@researchos/graph"` 只读打开课题 vault 的 `graph.db`）。
- 完成后在 `packages/client` 执行 `bun run generate` 重新生成客户端（`src/generated*` 不可手改）。

### 6.5 自动重解析 plugin（`.opencode/plugin/graph-autolink.ts`）

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { parseFile, openStore } from "@researchos/graph"

export const GraphAutolink: Plugin = async () => ({
  event: async ({ event }) => {
    if (event.type !== "file.edited") return
    const path = event.properties.file
    if (!/\.(md|tex)$/.test(path) || !path.includes("vault/")) return
    const store = openStore(vaultDir(path))
    const content = await Bun.file(path).text()
    const parsed = await parseFile({ path, content, citeKeyToPaperId: store.resolveCiteKey })
    store.replaceBySource(path, parsed)   // 先删 source_path 旧边再 upsert
  },
})
```

## 7. SubAgent 与 Skill 定义

### 7.1 `.opencode/agent/graph.md`

```markdown
---
description: 知识图谱构建代理——阅读论文/笔记后抽取概念并挂载到知识图谱
mode: subagent
model: inherit
color: "#9d7cd8"
permission:
  researchos-graph_parse_wikilinks: allow
  researchos-graph_upsert: allow
  researchos-graph_query: allow
  edit: deny
---

你是 ResearchOS 的知识图谱构建代理。你的职责：在获得一篇论文笔记或文献元数据后，把它正确挂载到课题知识图谱中。

工作流程：
1. 调用 `researchos-graph_parse_wikilinks` 解析给定文件，确认已有链接。
2. 阅读内容，抽取 3–8 个核心概念（方法名、任务、数据集、指标），每个生成 `concept:<slug>` 节点（label 用规范英文名）。
3. 建立边并调用 `researchos-graph_upsert`：
   - 论文 → 概念：`mentions`（context 填论文中对应句子）；
   - 论文 → 代码仓库（若有官方实现）：`implements`（repo 节点 id 为 `repo:github.com/...`）；
   - 新概念 → 已有概念：仅当存在明确"改进自/演进自"关系时建 `evolves`，拿不准就不建。
4. 概念若已有对应 `vault/concepts/<slug>.md` 则不重复创建；没有时只在被明确要求时写概念页。
5. 禁止虚构节点：所有 concept 必须能在原文中找到出处；不确定的关系一律用 `mentions` 而非 `evolves`。

完成后用 3 行以内汇报：新建概念数、新建边数、跳过的存疑项。
```

### 7.2 `.opencode/skill/graph-rag/SKILL.md`

```markdown
---
name: graph-rag
description: 基于课题知识图谱做语义查询（Graph RAG）。当用户提问涉及"哪些文献/概念/代码之间有关联""找出关于 X 的所有相关工作"时使用。
---

# Graph RAG 查询范式

1. 先调用 `researchos-graph_query`，传入用户原始问题；如涉及以某篇论文/概念为中心的探索，填 `scope.center_node`，`depth` 默认 1，跨主题探索用 2。
2. 工具返回 `{ subgraph, context_pack, seeds }`：
   - `seeds` 是向量/全文召回的种子节点，`subgraph` 是 k-hop 扩展结果，`context_pack` 是按边上下文拼好的证据片段。
3. 作答要求：
   - 只依据 `context_pack` 与 `subgraph` 作答，不得引入图谱外的臆测；
   - 每个论断后用 `[[节点 label]]` 标注来源节点；
   - 列出子图中 `implements` 边指向的 repo 节点作为"对应代码实现"；
   - 若 `seeds` 为空，明确告知"图谱中尚无相关内容"，并建议先导入文献或让 graph SubAgent 建链。
4. 需要查看某节点全文时，用 Read 工具读其 `source_path` 对应文件，不要凭 label 猜测内容。
```

## 8. 前端界面落地

对应 UI 设计 3.4 节（全屏画布 + 浮动控制），页面放 `packages/app/src/pages/graph.tsx`，在 `app.tsx` 的 `Routes()` 注册 `/graph`，icon rail 在 `packages/app/src/pages/layout/sidebar-shell.tsx` 增加 `◈ 知识图谱` 入口（accent 紫 `#9d7cd8` 语义）。

组件拆分（`packages/app/src/pages/graph/`）：

| 组件 | 职责 | 复用 |
| --- | --- | --- |
| `graph.tsx` | 页面壳：数据加载（client `graph.get`）、选中态、筛选态 | `Location` 上下文拿当前课题 |
| `graph-canvas.tsx` | SVG 力导向画布：`d3-force` simulation + `d3-zoom`；节点按类型着色（文献蓝 `#61afef`/概念紫 `#9d7cd8`/笔记橙 `#fab283`/代码绿 `#7fd88f`），边按关系线型（cites 实线/mentions 虚线/implements 点线/evolves 箭头 marker）；拖拽结束时调 `graph.save_layout` 持久化坐标；无坐标节点前端跑 simulation，有坐标直接定位（环形布局由 server `layout` 端点给出） | `@opencode-ai/ui` 主题令牌（`bg-background-base`、`text-icon-base` 等 Tailwind 类） |
| `graph-topbar.tsx` | 筛选（节点类型 chip、时间范围）、布局切换（力导/环形）、搜索定位（输入 label → zoom 到节点） | `@opencode-ai/ui` 的 `IconButton`、chip 样式 |
| `node-drawer.tsx` | 右侧滑出详情抽屉：paper → Paper Card 摘要 + `加入引用` 跳转；note/concept → 内嵌 Markdown 预览；repo → OpenCode 代码理解入口链接；底部一度邻居列表 | 复用 app 现有 drawer/Markdown 渲染组件 |
| `rag-bar.tsx` | 底部悬浮提问条：提交 `graph.ask` → 命中子图在画布高亮（其余节点降透明度）+ 右侧滑出回答面板（answer + 来源引用芯片） | Agent Dock 的输入条样式 |

交互细节：hover 节点高亮一度邻居（其余降透明）；SubAgent 身份标签沿用 UI 设计"紫=图谱"；图谱更新（自动建链后）通过 `graph.get` 轮询/事件触发刷新并 toast 提示"图谱已更新"。

## 9. 开发步骤与里程碑

依赖：P1（文献中心）提供 `paper_id`/bibkey 映射与文献库；本模块自身从 wikilink 解析起步，文献映射接口未就绪时 `citeKeyToPaperId` 返回 `undefined` 降级运行。

- **W1：核心包与解析**
  1. 建 `packages/researchos-graph`（package.json、`Store` 接口、`SqliteStore` + DDL 迁移）。
  2. `wikilink.ts`：remark AST 解析 + LaTeX `\cite{}` 解析 + `replaceBySource` 回收语义。
  3. 单测覆盖解析与 upsert 幂等。
- **W2：MCP server + 自动建链**（依赖 W1）
  1. `mcp.ts` 四工具 + `opencode.json` 声明，在 OpenCode 会话中验证 `researchos-graph_*` 可调。
  2. `.opencode/plugin/graph-autolink.ts` 文件变更钩子。
  3. `.opencode/agent/graph.md` + `.opencode/skill/graph-rag/SKILL.md`，跑通"读一篇论文 → 自动挂概念"。
- **W3：HTTP 接口 + 前端画布**（依赖 W1；与 W2 可并行）
  1. `packages/protocol/src/groups/graph.ts` + `packages/server/src/handlers/graph.ts` + `packages/client` 重新 generate。
  2. `graph.tsx` + `graph-canvas.tsx` + `graph-topbar.tsx`：力导画布、着色/线型、坐标持久化。
  3. `node-drawer.tsx`。
- **W4：Graph RAG 闭环**（依赖 W2、W3）
  1. `embed.ts`（transformers.js + sqlite-vec，FTS 降级）+ `rag.ts`。
  2. `graph.ask` handler（context_pack → 会话作答）+ `rag-bar.tsx` 子图高亮。
  3. 端到端验收：导入 20 篇文献 + 若干笔记 → 图谱可视化 → 提问"找出所有关于注意力优化的文献及对应代码实现"正确返回子图与带来源回答。

## 10. 测试方案

- **单测**（`packages/researchos-graph`，在该目录内跑 `bun test`，遵守"不在 repo 根目录跑测试"）：
  - `test/wikilink.test.ts`：fixture 字符串覆盖 `[[a]]`、`[[a|alias]]`、`[[a#sec]]`、`\cite{k1,k2}`、无链接、重复链接去重；断言节点/边精确输出。
  - `test/store.test.ts`：临时目录建库，验证 upsert 幂等（重复 upsert 不产生重复边）、`replaceBySource` 回收旧边、级联删除、FTS 召回。
  - `test/rag.test.ts`：预置小图 + 固定嵌入（测试用确定性假向量写入 node_vec），验证 k-hop 扩展边界与 context_pack 组装；不 mock 存储，直接用内存 SQLite。
- **集成测试**：
  - MCP 层：在 `packages/researchos-graph/test/mcp.test.ts` 以子进程起 stdio server，走 SDK client 调四工具做 roundtrip。
  - HTTP 层：`packages/server` 内的 handler 测试（沿用 server 包既有测试模式），临时 vault 造数据后断言 `graph.get`/`graph.ask` 响应形状。
  - 前端：`packages/app` 不做重型组件测试，以手动验收清单为准（画布渲染、抽屉、RAG 高亮）。
- **类型检查**：在 `packages/researchos-graph`、`packages/protocol`、`packages/server` 各自目录跑 `bun typecheck`；protocol 变更后必须跑 `packages/client` 的 `bun run generate` 并确认 generated 无 diff 残留问题。

## 11. 风险与开放问题

1. **sqlite-vec 在 Bun/Windows 的加载**：扩展加载依赖动态库分发，Windows 上可能缺预编译产物。规避：Graph RAG 设计为 FTS-only 可降级，向量召回是增强项而非阻塞项；W4 第一周先验证加载。
2. **嵌入模型体积**：transformers.js 首次运行下载模型（~25MB–90MB），离线场景不可用。开放问题：是否复用 OpenCode 已配置的 provider embedding API 作为默认，本地方案作离线备选——倾向后者，待 P0 底座确定 provider 配置读取方式后定。
3. **MCP 子进程与 server handler 并发写同一 SQLite**：MCP server（写）与 OpenCode server（读）是两个进程。规避：全部连接开 `PRAGMA journal_mode=WAL` + busy_timeout；写操作集中在 MCP/plugin 侧，server handler 只读。
4. **wikilink 目标歧义**：同名 label 的 note 与 concept 冲突时解析顺序（paper → concept → note → 新建 concept）是启发式的，可能挂错。开放问题：是否在 UI 提供"未决链接"队列让用户确认——本期不做，先记录到 attrs 供后续。
5. **evolves 边质量**：AI 判"演进"关系容易过度建边。已在 SubAgent prompt 中限制为"拿不准用 mentions"，但需 W4 验收时人工抽查准确率，必要时加 diff review 确认步骤。
6. **力导布局规模**：>2k 节点 SVG 卡顿。开放问题：切换 Sigma.js 的触发阈值与接口替换点（`graph-canvas.tsx` 内部抽象渲染层）已预留，规模到限再迁移。
