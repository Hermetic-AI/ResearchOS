# 模块一：文献管理中心（Literature）技术落地文档

对应总体方案《ResearchOS最终方案.md》§三 模块一、§五 5.1 接口契约；UI 对应《ResearchOS-UI设计.md》§3.3。

## 1. 模块概述与目标

文献管理中心为 ResearchOS 提供类 Zotero 的本地优先文献库能力：通过 arXiv / Semantic Scholar / Crossref / PubMed 四个免费学术 API 做智能检索，将命中文献与本地导入的 PDF 统一落入项目级 SQLite 文献库，支持 PDF 元数据与引用关系提取、BibTeX/RIS/EndNote/JSON/Markdown 格式互转、IEEE/ACM/APA/Nature/Springer 引用生成，以及基于本地嵌入 + sqlite-vec 的相似文献推荐。Agent 侧通过 MCP server 暴露 `literature.*` 六个工具，由 Literature SubAgent 编排；用户侧在 app 前端提供三栏文献库页面。所有数据存于项目工作区内，断网可用（检索除外）。

## 2. 功能清单与范围边界

> 交付状态（2026-07-27）：W1–W4 全部交付并接通 Protocol/Server/Client/MCP/前端（MCP 六工具契约已齐）。剩余未做：导入任务进度、虚拟滚动等前端增强（W6 范围内）。

**做：**

- 文献智能搜索：四源并行检索、结果去重（DOI / arXiv ID / 标题归一化）、统一为 `PaperMeta`。
- 本地文献库：SQLite 单文件库 + 项目内 PDF 归档目录；分类（年份/会议/标签/收藏/未读）、Saved Search、Zotero 本地数据库一次性导入。
- PDF 元数据提取：pdfjs 提取文本 → DOI/标题正则 → Crossref/S2 在线补全；参考文献段规则解析提取引用关系，可选 GROBID 提升准确率。
- 格式转换与引用生成：BibTeX / RIS / EndNote / JSON / Markdown 互转；CSL 渲染 IEEE/ACM/APA/Nature/Springer 五种引用格式。
- 相似文献推荐：摘要本地嵌入（transformers.js + ONNX 模型）存入 sqlite-vec 虚拟表，向量近邻 + 共引加权排序。
- 前端三栏文献库页面（分类树 / Paper Card 列表 / 详情面板）。
- Literature SubAgent 与 paper-reading Skill：对话式检索、导入、AI 阅读笔记生成。

**不做（本期范围外）：**

- 在线云同步、多端协作、文献共享组（本地优先，后续再说）。
- PDF 全文阅读器 / 批注（详情页只做元数据与 AI 笔记，阅读交给系统 PDF 查看器或后续模块）。
- Zotero 双向同步（只做一次性导入，不写回）。
- 全文语义搜索（只对标题+摘要做嵌入，全文检索留给知识图谱模块的 RAG）。
- 引用关系的全网爬取（`cited_by` 仅查 Semantic Scholar API，不自建爬虫）。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 运行时/包管理 | Bun（`bun:sqlite`） | 仓库统一工具链，内置 SQLite 且支持 `loadExtension` | MIT |
| 文献库 | SQLite（单文件） | 本地优先、零外部依赖，与图谱模块同库演进 | Public Domain |
| 向量检索 | sqlite-vec（`vec0` 虚拟表） | 轻量、与文献库同文件，无需独立向量库 | MIT |
| 本地嵌入 | `@xenova/transformers`（transformers.js）+ `bge-small-en-v1.5` ONNX | 纯 JS/ONNX 本地推理，384 维，无 Python 依赖 | Apache-2.0 |
| PDF 文本提取 | `pdfjs-dist`（Mozilla PDF.js） | 成熟、纯 JS、Bun 可跑；只取文本层不渲染 | Apache-2.0 |
| PDF 深度解析（可选） | GROBID（Docker 部署，HTTP API） | PDF 参考文献解析事实标准；`processHeaderDocument` / `processReferences` | Apache-2.0 |
| 引用渲染 | `citation-js`（core + `@citation-js/plugin-csl` + `plugin-bibtex` + `plugin-ris`） | 覆盖 BibTeX/RIS 解析与 CSL 样式渲染，IEEE/APA 等样式用官方 CSL | MIT |
| 学术 API | arXiv API / Semantic Scholar Graph API / Crossref REST / NCBI E-utilities | 全部免费；薄 fetch 封装 + zod 校验，不引入 SDK | 各 API 条款 |
| MCP 传输 | `@modelcontextprotocol/sdk` stdio server | OpenCode `mcp` 配置原生支持 local command 方式 | MIT（仓库已有依赖与 patch） |
| 参数校验 | `zod` | 仓库统一（plugin tool API 即 zod） | MIT |

不引入的：Zotero 官方 API（只做本地 DB 导入）、Python 侧解析栈（文献解析用 TS 实现即可，避免为本模块单独维护 venv）。

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| 文献库内核（DB schema、API client、PDF 解析、格式转换、嵌入/推荐） | 新 package `@researchos/literature`（`packages/researchos-literature`） | 纯领域逻辑，需要被 MCP server 与 server handler 两侧复用；独立包可单测，不侵入核心 |
| `literature.search` 等六个工具 | MCP server `@researchos/mcp-literature`（stdio，bun 运行），在 `opencode.json` 的 `mcp` 键声明 | 总体方案已定"所有 Skill 以 MCP Tool 形式暴露"；MCP server 长驻、跨会话复用 DB 连接，工具以 `literature_*` 暴露给模型 |
| Literature SubAgent | `.opencode/agent/literature.md` | markdown + frontmatter 声明即可，零代码；`permission` 收敛到文献工具，经内置 TaskTool 被主 Agent 调度 |
| AI 阅读笔记流程 | `.opencode/skill/paper-reading/SKILL.md` | 是"读 PDF → 产出方法/创新点/局限性结构化笔记"的提示词流程，无代码，SkillTool 按需加载 |
| 前端三栏文献库页面 | app 路由页面 `packages/app/src/pages/literature/` | 复用 SolidJS 路由与 `@opencode-ai/ui` 主题令牌 |
| 前端数据通道 | protocol 新增 HttpApiGroup `LiteratureApi` + server handler + client `bun run generate` | 前端只走 generated client，遵守"Client 不得依赖 Core/Server"及依赖方向规则；handler 依赖 `@researchos/literature` |
| plugin tool | 不采用 | 六个工具已由 MCP server 覆盖；plugin 的 `tool()` 适合需要 `ToolContext`（session/权限询问）的场景，本模块无此需求，避免双份实现 |

依赖方向：`@researchos/literature` 不依赖任何 opencode 包；`@researchos/mcp-literature` 与 `packages/server` handler 分别依赖它；前端经 generated client 访问，方向安全。

## 5. 数据模型与本地存储设计

### 目录约定（项目工作区内）

```
<project>/.researchos/
└── literature/
    ├── literature.db          # SQLite 主库（含 vec0 虚拟表）
    ├── pdfs/                  # PDF 归档：<year>/<paper_id>.pdf
    │   └── 2024/7f3a9c2e.pdf
    ├── models/                # transformers.js ONNX 模型缓存（bge-small-en-v1.5）
    └── exports/               # 导出的 .bib/.ris 临时产物
```

`paper_id`：`sha1(doi ?? arxiv_id ?? normalized_title)` 前 8 位，天然去重键。Zotero 导入为一次性动作，不复制其 DB，只抽取后写入本库。

### DDL（`packages/researchos-literature/src/schema.sql`）

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS paper (
  id            TEXT PRIMARY KEY,          -- paper_id
  doi           TEXT UNIQUE,
  arxiv_id      TEXT,
  title         TEXT NOT NULL,
  year          INTEGER,
  venue         TEXT,                      -- 会议/期刊名
  abstract      TEXT,
  keywords      TEXT,                      -- JSON array
  citation_count INTEGER DEFAULT 0,
  pdf_path      TEXT,                      -- 相对 .researchos/literature/ 的路径
  source        TEXT,                      -- arxiv|semantic_scholar|crossref|pubmed|zotero|manual
  is_read       INTEGER DEFAULT 0,
  is_favorite   INTEGER DEFAULT 0,
  notes_md      TEXT,                      -- AI 阅读笔记（paper-reading Skill 产出）
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS author (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  affiliation TEXT
);

CREATE TABLE IF NOT EXISTS paper_author (
  paper_id  TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES author(id),
  position  INTEGER NOT NULL,              -- 作者顺序
  PRIMARY KEY (paper_id, author_id)
);

CREATE TABLE IF NOT EXISTS tag (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_tag (
  paper_id TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tag(id),
  PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collection (     -- 左栏分类树中的用户自定义集合/Saved Search
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL DEFAULT 'manual',    -- manual | saved_search
  query TEXT                               -- saved_search 时的查询串
);

CREATE TABLE IF NOT EXISTS paper_collection (
  paper_id      TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collection(id),
  PRIMARY KEY (paper_id, collection_id)
);

CREATE TABLE IF NOT EXISTS citation_edge (  -- 引用关系（references/cited_by 统一为有向边）
  from_id TEXT NOT NULL,                   -- 引用方
  to_id   TEXT NOT NULL,                   -- 被引方（允许不在 paper 表中的外部文献，落 external_paper）
  context TEXT,                            -- 引用上下文句（可选）
  source  TEXT NOT NULL DEFAULT 'pdf',     -- pdf | grobid | semantic_scholar
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS external_paper ( -- 被引但未入库的文献存根
  id    TEXT PRIMARY KEY,
  title TEXT,
  year  INTEGER,
  doi   TEXT
);

CREATE INDEX IF NOT EXISTS idx_paper_year ON paper(year);
CREATE INDEX IF NOT EXISTS idx_paper_venue ON paper(venue);
CREATE INDEX IF NOT EXISTS idx_edge_to ON citation_edge(to_id);

-- sqlite-vec 虚拟表（loadExtension 后执行，缺失扩展时整表跳过、推荐功能降级）
CREATE VIRTUAL TABLE IF NOT EXISTS paper_embedding USING vec0(
  paper_id TEXT PRIMARY KEY,
  embedding float[384]
);
```

### Zotero 导入映射

只读打开用户指定的 `zotero.sqlite`（先 `Bun.file().arrayBuffer()` 复制到临时文件再打开，避免锁冲突），映射：`items`+`itemDataValues` → `paper`，`creators` → `author`/`paper_author`，`tags` → `tag`/`paper_tag`，`collections` → `collection`，`itemAttachments`（linked_file / imported_file 且 contentType=application/pdf）→ 复制 PDF 进归档目录。中文/重复条目以 DOI 去重。

## 6. 核心接口实现

### 6.1 内核包结构（`packages/researchos-literature/src/`）

```
index.ts            # 自顶导出：export * as Literature from "./service"
service.ts          # 门面：openLibrary(root) → { search, importPdf, getMetadata, ... }
db.ts               # bun:sqlite 打开/迁移/loadExtension(sqlite-vec)
types.ts            # PaperMeta 等类型 + zod schema
sources/
  arxiv.ts          # fetch + Atom XML 解析
  semanticscholar.ts
  crossref.ts
  pubmed.ts         # E-utilities esearch→efetch
pdf/
  extract.ts        # pdfjs-dist 文本提取
  metadata.ts       # DOI/标题正则 + 在线补全
  references.ts     # 参考文献段规则解析
  grobid.ts         # 可选 GROBID HTTP 客户端
convert/
  bibtex.ts ris.ts endnote.ts markdown.ts   # 基于 citation-js
cite.ts             # CSL 样式渲染（ieee/acm/apa/nature/springer → CSL JSON）
embed.ts            # transformers.js pipeline("feature-extraction")
recommend.ts        # vec0 KNN + 共引加权
zotero.ts           # Zotero DB 导入
```

`PaperMeta`（与总体方案 §5.1 出参一致）：

```ts
export const PaperMeta = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().optional(),
  venue: z.string().optional(),
  doi: z.string().optional(),
  arxiv_id: z.string().optional(),
  abstract: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  citation_count: z.number().default(0),
  pdf_path: z.string().optional(),
  source: z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed", "zotero", "manual"]),
})
export type PaperMeta = z.infer<typeof PaperMeta>
```

### 6.2 MCP server 工具签名（`packages/researchos-mcp-literature/src/index.ts`）

stdio server，`opencode.json` 声明：

```json
{
  "mcp": {
    "literature": {
      "type": "local",
      "command": ["bun", "run", "packages/researchos-mcp-literature/src/index.ts"],
      "enabled": true
    }
  }
}
```

工具命名遵循 MCP 暴露规则，模型侧看到 `literature_search` 等（server 前缀 + tool 名）。六个工具一一对应总体方案 §5.1 契约：

```ts
server.tool(
  "search",
  "Search academic papers across arXiv / Semantic Scholar / Crossref / PubMed",
  {
    query: z.string(),
    sources: z.array(z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed"])).optional(),
    limit: z.number().int().max(50).default(10),
  },
  async (args) => jsonResult(await lib.search(args)),
)

server.tool("import_pdf", "Import a local PDF or PDF URL into the library", {
  path: z.string().optional(),
  url: z.string().optional(),
}, ...)

server.tool("get_metadata", "Get full metadata of a paper", {
  paper_id: z.string().optional(),
  doi: z.string().optional(),
}, ...)

server.tool("get_citations", "Get references or citing papers of a paper", {
  paper_id: z.string(),
  direction: z.enum(["references", "cited_by"]),
}, ...)

server.tool("recommend_similar", "Recommend similar papers by abstract embedding + co-citation", {
  paper_id: z.string(),
  limit: z.number().int().default(10),
}, ...)

server.tool("export", "Export papers as BibTeX / RIS / EndNote / JSON / Markdown or a formatted citation", {
  paper_ids: z.array(z.string()),
  format: z.enum(["bibtex", "ris", "endnote", "json", "markdown"]),
  style: z.enum(["ieee", "acm", "apa", "nature", "springer"]).optional(),
}, ...)
```

### 6.3 关键流程实现要点

**search（多源并行 + 去重）**：

```
1. 按 sources（缺省四源全开）并行调用各 source client，各自超时 8s，单源失败降级为空数组不阻塞
2. 各源结果归一化为 PaperMeta（arXiv Atom XML → fast-xml-parser 或手写正则；PubMed 走 esearch 拿 PMID 再 efetch 取 XML）
3. 去重键：doi 小写 > arxiv_id > 标题归一化（小写、去标点、去多余空白）
4. 合并同键条目（补全字段，citation_count 取最大值），按相关性（源内排名倒数和）排序截 limit
5. 命中结果 upsert 进 paper 表（惰性入库，保证后续 get_metadata/recommend 可直接用）
```

**import_pdf**：

```
1. 入参二选一：path（限工作区内，越界直接报错）或 url（下载到 pdfs/ 临时名）
2. pdfjs 提取前 3 页文本 → 正则找 DOI（10.\d{4,9}/[-._;()/:A-Z0-9]+）；找不到则取首屏最长行作标题候选
3. 有 DOI → Crossref works/{doi} 补全；无 DOI → Semantic Scholar title match 兜底；均无 → 以提取文本建 minimal 条目
4. 计算 paper_id，PDF 重命名为 pdfs/<year>/<paper_id>.pdf，upsert paper 行
5. 后台任务（不阻塞返回）：全文文本 → references.ts 规则解析参考文献段
   - 定位 References/Bibliography 段，按 [1] / 1. / 作者-年份 三种编号模式切条
   - 每条尝试提取 DOI/arXiv ID/标题，落 external_paper + citation_edge(from=本文)
   - 若环境变量 RESEARCHOS_GROBID_URL 存在，改用 GROBID processReferences 结果覆盖
6. 摘要存在且 sqlite-vec 可用 → 计算嵌入写入 paper_embedding
```

**recommend_similar**：

```
1. 取目标 paper 的 embedding；无则现场算（有 abstract 才做，否则只走共引）
2. vec0 KNN：SELECT paper_id, distance FROM paper_embedding
   WHERE embedding MATCH ? AND k = limit*3
3. 共引加分：与目标共享 references 的数量 * 0.15 加进 score
4. 合并排序、排除自身、join paper 表返回 PaperMeta & { score }
5. sqlite-vec 未加载（扩展缺失）时降级为关键词重叠 + 共引排序，返回结果带 degraded: true
```

**export / cite**：citation-js 将 `PaperMeta[]` 转 CSL JSON → `plugin-csl` 按样式模板渲染。五个样式对应官方 CSL：`ieee` → `ieee.csl`，`acm` → `acm-sig-proceedings.csl`，`apa` → `apa.csl`，`nature` → `nature.csl`，`springer` → `springer-basic-author-date.csl`。样式文件打包进包内 `csl/` 目录，运行时不联网。`format` 与 `style` 同时给时，markdown 输出为渲染后的引用字符串列表，bibtex/ris/endnote 忽略 style。

### 6.4 前端数据通道（protocol / server / client）

- `packages/protocol/src/groups/literature.ts`：新增 HttpApiGroup，端点与内核方法一一对应：`GET /literature/papers`（列表，支持 collection/tag/year/未读/收藏过滤与关键词过滤）、`GET /literature/papers/:id`、`GET /literature/papers/:id/citations?direction=`、`GET /literature/papers/:id/similar`、`POST /literature/search`、`POST /literature/import`、`GET /literature/export?ids=&format=&style=`、`GET /literature/tree`（分类树聚合：年份/会议/标签/集合计数）。
- `packages/protocol/src/api.ts` 注册该 group。
- `packages/server/src/handlers/literature.ts`：handler 解析项目根 → `Literature.openLibrary(root)` 调内核，薄转发不含业务逻辑；DB 句柄按 project 缓存。
- `packages/client` 执行 `bun run generate` 重新生成客户端；generated 目录不手改。

## 7. SubAgent 与 Skill 定义

### `.opencode/agent/literature.md`

```markdown
---
description: 文献调研专家。负责学术搜索、文献库管理、PDF 导入、引用生成与相似文献推荐。当任务涉及查找论文、管理参考文献、生成 BibTeX 或综述调研时使用。
mode: subagent
model: inherit
color: "#61afef"
permission:
  literature_search: allow
  literature_import_pdf: allow
  literature_get_metadata: allow
  literature_get_citations: allow
  literature_recommend_similar: allow
  literature_export: allow
  read: allow
  edit: deny
  bash: deny
---

你是 ResearchOS 的文献调研 SubAgent。工作准则：

1. 检索先用 `literature_search`，query 用英文关键词组合（学术 API 对英文召回更好），
   用户给中文需求时自行翻译；默认四源全开，limit 默认 10，用户要"多找一些"时提到 20–50。
2. 检索结果按相关性给用户排序汇报：标题、作者、年份、venue、引用数，一句话概括贡献。
3. 用户确认要保留的文献，已自动入库；用户给出本地 PDF 或下载链接时用 `literature_import_pdf`。
4. 需要"这篇论文引用了什么 / 被谁引用"用 `literature_get_citations`，区分 references 与 cited_by。
5. "找相关工作 / 类似论文"用 `literature_recommend_similar`。
6. 任何引用格式需求（BibTeX、IEEE、APA……）统一走 `literature_export`，不要手写 BibTeX。
7. 批量调研任务（如"调研某方向近 3 年工作"）：多轮 search（变换关键词、加年份限定）→
   去重汇报 → 推荐 5–10 篇核心 → 询问用户是否导出 BibTeX。
8. 产出汇报用 Markdown 表格，附 DOI/arXiv 链接；不确定的元数据明确标注，禁止编造。
```

### `.opencode/skill/paper-reading/SKILL.md`

```markdown
---
name: paper-reading
description: 精读一篇文献并生成结构化阅读笔记（研究问题/方法/创新点/实验/局限性），写入文献库 notes_md。当用户要求"读一下这篇论文""做阅读笔记""总结这篇文献"时使用。
---

# Paper Reading

对指定文献（paper_id / DOI / 本地 PDF 路径）生成结构化 AI 阅读笔记。

## 步骤

1. 定位文献：若是路径，先 `literature_import_pdf` 入库拿到 paper_id；否则 `literature_get_metadata`。
2. 读取全文文本：若条目已有 pdf_path，用 read 工具读取提取的文本（或请求用户贴出关键章节）。
3. 按以下结构撰写笔记（中文，术语保留英文），写入文献库该条目的 notes_md：

   ## 研究问题
   一段话说清要解决什么问题、为什么重要。
   ## 方法
   核心技术路线，3–6 个要点；有公式/架构图时指出所在章节。
   ## 创新点
   与最相近工作的差异，逐条列出。
   ## 实验
   数据集、基线、主要指标结果（带数字）。
   ## 局限性
   作者自述 + 你判断的未解决问题。
   ## 可复用资源
   代码/数据/模型链接（若有）。

4. 笔记末尾给出 3–5 个建议 tag，调用方确认后写入文献库标签。
5. 若用户要求"加入图谱"，提示该能力由知识图谱模块的 graph.upsert 完成，不在本 Skill 范围。

## 约束

- 笔记必须基于实际读到的文本，读不到全文时明确说明"仅基于摘要"并降级笔记粒度。
- 不修改 PDF 与其他文献条目。
```

## 8. 前端界面落地

对应 UI 设计 §3.3（三栏：分类树 | 文献列表 | 文献详情），整体配色遵循 UI 设计 token（文献蓝 `#61afef` 作为本模块强调色，经由 `@opencode-ai/ui` 主题令牌消费，背景类如 `bg-background-base`）。

**路由与入口**：

- 在 `packages/app/src/app.tsx` 的 `Routes()` 中 `/:dir` 布局下新增 `Route path="/literature" component={LiteratureRoute}`。
- 页面目录 `packages/app/src/pages/literature/`：`literature.tsx`（路由入口/三栏布局）、`tree-panel.tsx`、`paper-list.tsx`、`paper-card.tsx`、`detail-panel.tsx`、`similar-strip.tsx`、`export-menu.tsx`、`store.ts`（Solid store：选中集合/选中文献/搜索词/导入任务进度）。
- 侧栏入口在 `packages/app/src/pages/layout/sidebar-shell.tsx` 的 icon rail 增加 ▤ 项，导航到 `/:dir/literature`。
- 数据访问全部走 `@opencode-ai/client` generated client 的 `literature` 端点，不直连 DB。

**组件拆分与复用**：

- 三栏骨架复用 app 已有的 pane/resizable 布局原语（与 session 页一致的 split 模式），左栏 240px、中栏 flex、右栏 420px，均可折叠。
- 左栏 `tree-panel.tsx`：智能分类（年份/会议/标签/未读/收藏）+ Saved Search + 导入来源；数据来自 `GET /literature/tree`，节点带计数徽章，复用 `@opencode-ai/ui` 的 List/Tree 与 Badge 组件。
- 中栏 `paper-list.tsx`：顶部搜索框（回车 → `POST /literature/search`，输入即本地过滤已入库条目）；Paper Card 显示标题、作者（et al. 截断）、年份、venue 徽章、引用数、相关性评分条（search 结果带 score 时渲染）；长列表用 `@tanstack/solid-virtual` 虚拟滚动。
- 右栏 `detail-panel.tsx`：分区块——元数据全表（DOI 可点击外链）、Abstract、Keywords 芯片、AI 阅读笔记（Markdown 渲染，复用 app 已有 markdown 渲染组件；无笔记时显示"生成阅读笔记"按钮，触发 Agent Dock 调 paper-reading Skill）、References / Cited by 双向列表（Tab 切换）、`similar-strip.tsx` 相似文献横滑卡片、操作区按钮组：`导出`（下拉选格式/样式 → `GET /literature/export`，结果弹窗可复制/保存）、`插入引用到论文`（复制 `\cite{key}` + BibTeX 到剪贴板）、`加入图谱`（调知识图谱模块端点，本期先禁用占位）。
- 加载态：PDF 导入/解析进度与列表加载用 shimmer 骨架（复用 `@opencode-ai/ui` Skeleton）。
- 导入入口：左栏底部 `导入 PDF`（文件选择）与 `从 Zotero 导入`（选 zotero.sqlite 路径），对应 `POST /literature/import`。

## 9. 开发步骤与里程碑

| 周 | 任务 | 依赖 |
| --- | --- | --- |
| W1 | 建 `packages/researchos-literature` 骨架（schema.sql、db.ts 迁移、types.ts）；四源 API client + 单测（fixture 响应）；`search` 端到端可跑 — **已交付** | 无 |
| W2 | PDF 文本提取与元数据补全链路（extract/metadata/references 规则解析）；`import_pdf`、`get_metadata`；PDF 归档目录约定落地 — **已交付** | W1 |
| W3 | 格式转换与 CSL 引用渲染（citation-js 集成，五种样式快照测试）；`export`；Zotero DB 导入器 — **已交付** | W1 |
| W4 | sqlite-vec 集成 + transformers.js 嵌入管线（模型缓存到 models/）；`recommend_similar` 与降级路径；`get_citations`（含 S2 cited_by 补全） — **已交付** | W1、W2 |
| W5 | `packages/researchos-mcp-literature` stdio server 封装六工具；`opencode.json` 接线；`.opencode/agent/literature.md` 与 `paper-reading` Skill 联调 | W2–W4 |
| W6 | protocol group + server handler + client generate；前端三栏页面与侧栏入口；导入/导出交互闭环 | W3（导出）、W5 |

里程碑验收：W4 末命令行完成"搜 20 篇论文并生成文献库 + BibTeX"（总体方案 P1 验收标准）；W6 末前端三栏页可完成同样流程且 Agent 会话内 Literature SubAgent 可独立完成调研任务。

## 10. 测试方案

测试全部放 `packages/researchos-literature/test/`（前端组件测试放 `packages/app`，如有既有测试基建再跟随），**不在 repo 根目录跑测试**：在包目录下执行 `bun test`，typecheck 同样在包目录跑 `bun typecheck`。

**单元测试**（`bun test`，不依赖网络与全局 mock）：

- `sources/*.test.ts`：四源响应解析——把真实抓取的 API 响应存为 `test/fixtures/`（arxiv.xml、s2.json、crossref.json、pubmed.xml），断言归一化后的 `PaperMeta` 字段；去重逻辑用构造数据覆盖 DOI/arXiv/标题三级键。
- `pdf/metadata.test.ts`、`pdf/references.test.ts`：2–3 个小型样例 PDF 放 `test/fixtures/pdfs/`（选 arXiv 开放获取论文，注意 license），断言 DOI/标题提取与参考文献切条数、DOI 召回率。
- `convert/*.test.ts`：BibTeX/RIS 往返转换（parse→serialize→parse 字段不变）；五种 CSL 样式对固定条目做快照比对。
- `recommend.test.ts`：内存库灌入 20 条带嵌入的条目，断言 KNN 排序正确与 sqlite-vec 缺失时的降级结果（`degraded: true`）。
- `zotero.test.ts`：用 SQL 脚本构造最小 zotero.sqlite fixture，断言映射后行数与字段。

**集成测试**（`test/integration/`，默认跳过、环境变量开启）：

- 实网四源冒烟：`RESEARCHOS_LIVE=1 bun test test/integration` 打真实 API 验证连通与 schema 未漂移，CI 中 weekly 跑一次即可。
- MCP server 端到端：用 `@modelcontextprotocol/sdk` 的 InMemoryTransport 起 server 调六个 tool，断言出参符合 §5.1 契约。
- server handler 层：跟随 `packages/server` 既有测试基建（若有），对 `/literature/*` 端点做请求级测试。

GROBID 不测真容器：对 `grobid.ts` 只测其 TEI XML 解析函数（fixture TEI 文件），HTTP 调用点做开关隔离。

## 11. 风险与开放问题

- **API 限流**：Semantic Scholar 无 key 约 100 req/5min，PubMed 无 key 3 req/s。薄 client 内置串行队列 + 指数退避；配置项预留 `semantic_scholar`/`ncbi` API key。四源 schema 可能漂移——靠集成冒烟测试兜底。
- **sqlite-vec 加载**：W4 实测 npm 包 `sqlite-vec`（win32-x64 预编译二进制）在 Windows + `bun:sqlite` 下 `loadExtension` 成功，vec0 建表/KNN 可用；加载失败时 `vecAvailable=false`，推荐功能走关键词降级路径，核心链路不受影响。linux/mac 两端未实测，CI 需补验证。
- **嵌入模型体积与首载**：`bge-small-en-v1.5` ONNX 约 100MB，首次下载慢；缓存在项目 `.researchos/literature/models/`，并考虑全局缓存复用。中文摘要召回一般，若中文需求变重要，开放问题：是否换 multilingual-e5-small。注：实际集成用 `@huggingface/transformers`（`@xenova/transformers` 的同项目新名，后者已停更）。
- **规则解析引用关系的准确率**：规则解析已随 W2 落地（`pdf/references.ts`）；无 GROBID 时参考文献切条对双栏排版/无编号格式召回有限，预期 70–85%；GROBID 需 Docker，作为可选增强（`RESEARCHOS_GROBID_URL` 开启），安装引导后续做进设置页。
- **Zotero 库版本差异**：不同 Zotero 版本 schema 有细微差异，导入器按核心表/字段做防御式读取，读不到的字段跳过并汇总报告。
- **openalex 备选**：若 Crossref/S2 覆盖不足，OpenAlex（免费、CC0）可作为第五源追加，client 结构已按 source 插件化，追加成本低。
- **待总体方案确认**：知识图谱模块与本模块共用 `citation_edge`/`external_paper` 表还是各自建表（建议共用同库，待模块二文档对齐）；`插入引用到论文` 与 LaTeX 模块的 BibTeX 文件落点约定（建议 `<project>/references.bib` 单文件，导出时增量合并去重）。
