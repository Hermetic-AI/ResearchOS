# 模块五：论文写作助手（Paper Writing）技术落地文档

> 交付状态（2026-07-29）：P3.2 页面主链已交付。写作 HTTP 契约已从回显 stub 替换为真实 CSV/Markdown 转换、词级 diff、句级 hunk 应用、文献库 BibTeX 解析/原子合并与建议记录；LaTeX 页内已挂标题、结构、润色、排版、引用五标签侧栏。AI 标题/结构通过可审阅的 `paper-writer` 会话提示进入模型链路，不在浏览器伪造结果；润色须逐 hunk 审核后才写回编辑缓冲区。`paper-titles`、`paper-structure`、`cite-assist` Skill 已补齐并通过 frontmatter 校验。

> 对应总体方案「模块五」与接口定义 5.5 节；UI 对应设计文档 3.7 节。
> 开发阶段归属 **P3（LaTeX + 写作）**，其中引用助手依赖 P1（文献中心）的文献库。

## 1. 模块概述与目标

论文写作助手为研究者提供覆盖"立意 → 搭骨架 → 润色 → 排版 → 引用"的写作全链路 AI 辅助：根据摘要生成多版本候选标题、按目标会议生成论文结构骨架、对选中文本做学术润色、把实验代码提炼为 Algorithm2e 伪代码、把 CSV 结果与 Markdown 笔记转为 LaTeX，并根据当前段落从本地文献库推荐引用、一键插入 `\cite{}` 与 BibTeX 条目。落地形态以 **Paper Writing SubAgent + Skill 池**为智能层，**`@researchos/writing` 插件包**承载确定性转换工具，前端作为 **LaTeX 编辑器内嵌的标签页侧栏**存在。核心约束：**所有 AI 修改一律走 diff review，绝不静默改写文件**。

## 2. 功能清单与范围边界

### 做什么

| 功能 | 接口 | 说明 |
| --- | --- | --- |
| 标题生成 | `writing.suggest_titles` | 输入摘要/关键词，产出多版本候选标题卡片，采纳后替换 `\title{}` |
| 结构建议 | `writing.suggest_structure` | 按研究方向 + 目标 venue 生成章节骨架，与当前大纲做差异对比，可生成 `paper.tex` 骨架文件 |
| 学术润色 | `writing.rewrite` | 选中文本 → academic / concise / passive 三种风格重写，diff 视图逐条接受/拒绝 |
| 代码转伪代码 | `writing.code_to_algorithm` | 源文件/函数 → Algorithm2e（备选 algorithmicx）LaTeX 片段 |
| CSV 转表格 | `writing.table_to_latex` | CSV → booktabs 风格 LaTeX 表格，含 caption/label |
| Markdown 转 LaTeX | `writing.md_to_latex` | Markdown 笔记 → LaTeX 片段（标题/列表/公式/代码/表格） |
| 引用助手 | `writing.cite_assist` | 当前段落 → 本地文献库检索 + 去重 → 推荐文献卡片 → 插入 `\cite{key}` 并追加 BibTeX 到 `refs.bib` |

### 不做什么

- **不做 LaTeX 编译与预览**：属于 LaTeX Skill 组（5.3，`latex.compile` 等）与编辑器模块（3.5），本模块只产出 LaTeX 文本。
- **不做全文自动代写**：只提供标题、骨架、段落级润色与排版辅助，不一次性生成整篇论文正文。
- **不做联网文献检索**：在线检索（arXiv / Semantic Scholar / Crossref）属于 P1 文献中心；本模块的引用助手只查询本地文献库，发现库内无结果时提示用户去文献中心检索。
- **不做引用格式渲染**（IEEE/ACM/APA 样式输出）：那是文献中心 `导出 BibTeX` 的职责；本模块只保证 BibTeX 条目合法、key 不冲突。
- **不静默改文件**：任何写入（`\title` 替换、章节骨架、润色、`\cite` 插入、BibTeX 追加）必须经过用户 diff review 确认。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 智能层 | OpenCode SubAgent（`.opencode/agent/paper-writer.md`）+ Skill 池（`.opencode/skill/*`） | 标题/结构/润色/伪代码本质是 prompt 工程，SubAgent + Skill 是 OpenCode 原生扩展点，零内核侵入 | — |
| 确定性转换工具 | `@researchos/writing` 插件包（OpenCode Plugin `tool()` API，TypeScript + zod） | CSV→LaTeX、MD→LaTeX、BibTeX key 查重是确定性逻辑，放 plugin tool 可单测、可复用 | — |
| CSV 解析 | `papaparse` | 成熟、流式、处理引号/转义边界情况完备 | MIT |
| Markdown 解析 | `markdown-it` | token 流易于自定义 renderer 输出 LaTeX；比引 pandoc 二进制轻 | MIT |
| 文本 diff（前端） | `diff`（jsdiff） | 词级 diff 用于润色 review 视图，体积小、API 稳定 | BSD-3-Clause |
| BibTeX 解析/校验 | 自研轻量 parser（正则 + 状态机，放 `@researchos/writing`） | 只需 entry 切分、key 提取、字段查重，不需要完整 BibTeX AST | — |
| 文献库查询 | 复用 P1 文献中心的本地 SQLite（`researchos.db`）+ sqlite-vec | 引用助手与文献库同库，避免数据复制 | — |
| 前端 | SolidJS + `@opencode-ai/ui`（Tailwind 主题令牌） | 与 packages/app 技术栈一致 | — |
| 测试 | Bun test | 仓库统一测试运行时 | — |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| 标题生成 / 结构建议 / 学术润色 / 代码转伪代码 | **Skill 池**（`.opencode/skill/paper-titles`、`paper-structure`、`academic-polish`、`algo2e`），由 SubAgent 编排 | 纯 LLM 生成任务，质量取决于 prompt 与上下文组织，无确定性逻辑；Skill 的 SKILL.md 形式便于迭代 prompt 而不发版 |
| 引用助手（排序与生成） | **Skill**（`.opencode/skill/cite-assist`）+ 调用文献库 tool | 推荐理由阐述、引用位置建议需要 LLM；检索走 tool |
| CSV→LaTeX、MD→LaTeX、BibTeX key 查重/追加 | **plugin tool**（`@researchos/writing` 包，`tool({description, args, execute})`） | 确定性转换，必须可单测、输出稳定；模型只负责调用与展示 |
| 文献库检索（供 cite_assist） | **复用 P1 的 MCP server**（`researchos-library`，工具如 `researchos-library_search_papers`） | 数据在文献中心的 SQLite，检索能力已在 P1 实现；本模块不重复建设 |
| 文件写入与 diff review | **复用 OpenCode 原生 edit/write 工具流** | OpenCode 的文件编辑天然带 diff 与权限确认，SubAgent 通过 edit 工具落盘即自动满足"不静默改写" |
| 写作侧栏 UI | **app 前端组件**（嵌入 LaTeX 编辑器页面，非独立路由） | UI 设计 3.7 明确"与 LaTeX 编辑器共生，以侧栏/面板形式存在"；复用编辑器上下文（选区、当前文件） |
| 润色建议记录 | **新 package `@researchos/writing` 内的 SQLite 访问层** | 记录 diff review 的接受/拒绝历史，用于统计与后续 prompt 偏好调优 |

**为什么不用独立 MCP server 承载 writing.\*：** 7 个接口中 5 个是 LLM 生成任务（走 Skill），2 个是确定性转换（走 plugin tool）。plugin tool 与 MCP tool 对模型同等可见（`{server}_{tool}` vs 直接工具名），而 plugin 免进程管理、与仓库同语言同测试体系，故不为本模块单建 MCP server。

**opencode.json 注册：**

```json
{
  "plugin": ["@researchos/writing"],
  "mcp": {
    "researchos-library": { "type": "local", "command": ["bun", "run", "packages/researchos-library/src/mcp.ts"] }
  }
}
```

## 5. 数据模型与本地存储设计

### 5.1 文件目录约定（论文工程）

```
<project>/
├── paper/
│   ├── main.tex              # 主文件，\title{} 所在
│   ├── refs.bib              # 引用助手追加 BibTeX 的唯一目标
│   ├── sections/             # suggest_structure 生成的章节骨架
│   │   ├── intro.tex
│   │   └── ...
│   ├── algorithms/           # code_to_algorithm 产出的 .tex 片段
│   └── tables/               # table_to_latex 产出的 .tex 片段
└── notes/                    # md_to_latex 的输入来源（Markdown 笔记）
```

### 5.2 SQLite 表（写入 P1 同一个 `researchos.db`，迁移脚本放 `@researchos/writing/src/migrations/`）

```sql
-- 一次 AI 写作建议的记录（标题/结构/润色/排版/引用通用）
CREATE TABLE IF NOT EXISTS writing_suggestion (
  id            TEXT PRIMARY KEY,            -- ulid
  kind          TEXT NOT NULL,               -- 'title' | 'structure' | 'rewrite' | 'algorithm' | 'table' | 'md' | 'cite'
  target_file   TEXT,                        -- 作用文件（paper/main.tex 等），可为空
  input_digest  TEXT NOT NULL,               -- 输入文本的 sha256，用于去重与缓存
  input_excerpt TEXT NOT NULL,               -- 输入前 500 字符，供历史列表展示
  output        TEXT NOT NULL,               -- 产出内容（JSON：候选列表 / diff 后文本 / latex 片段）
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected' | 'partial'
  created_at    INTEGER NOT NULL,
  reviewed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_writing_suggestion_kind ON writing_suggestion(kind, created_at);

-- 润色逐条 hunk 的接受/拒绝（一条 rewrite 建议拆多个 hunk）
CREATE TABLE IF NOT EXISTS writing_rewrite_hunk (
  id            TEXT PRIMARY KEY,
  suggestion_id TEXT NOT NULL REFERENCES writing_suggestion(id),
  hunk_index    INTEGER NOT NULL,            -- 在 diff 中的序号
  original      TEXT NOT NULL,
  revised       TEXT NOT NULL,
  accepted      INTEGER NOT NULL,            -- 0/1
  style         TEXT NOT NULL                -- 'academic' | 'concise' | 'passive'
);
CREATE INDEX IF NOT EXISTS idx_rewrite_hunk_suggestion ON writing_rewrite_hunk(suggestion_id);

-- 引用插入记录：tex 位置 ↔ 文献库 paper ↔ bib key
CREATE TABLE IF NOT EXISTS writing_citation (
  id            TEXT PRIMARY KEY,
  tex_file      TEXT NOT NULL,
  cite_key      TEXT NOT NULL,
  paper_id      TEXT NOT NULL,               -- P1 文献库 paper.id
  context_hash  TEXT NOT NULL,               -- 所在段落 sha256
  created_at    INTEGER NOT NULL,
  UNIQUE (tex_file, cite_key)
);
```

设计要点：`status='partial'` 表示 hunk 部分接受；`input_digest` 命中且 `status='accepted'` 的记录可直接复用结果作缓存，避免重复调 LLM。

## 6. 核心接口实现

### 6.1 plugin tool：`@researchos/writing`（`packages/researchos-writing/src/index.ts`）

```ts
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"

export const WritingPlugin = async () => ({
  tool: {
    table_to_latex: tool({
      description: "Convert a CSV file to a booktabs-style LaTeX table",
      args: {
        file: z.string().describe("path to the CSV file"),
        caption: z.string().optional(),
        label: z.string().optional(),
        style: z.enum(["booktabs"]).default("booktabs"),
      },
      execute: async (args) => convertCsvToLatex(args), // 返回 { latex }
    }),
    md_to_latex: tool({
      description: "Convert a Markdown note to a LaTeX fragment",
      args: { file: z.string() },
      execute: async (args) => convertMdToLatex(args), // 返回 { latex }
    }),
    bibtex_upsert: tool({
      description: "Insert BibTeX entries into refs.bib, skipping duplicate keys",
      args: {
        bib_file: z.string(),
        entries: z.array(z.object({ key: z.string(), bibtex: z.string() })),
      },
      execute: async (args) => upsertBibtex(args), // 返回 { inserted: string[], skipped: string[] }
    }),
    suggest_record: tool({
      description: "Persist a writing suggestion and its review outcome",
      args: {
        kind: z.enum(["title", "structure", "rewrite", "algorithm", "table", "md", "cite"]),
        target_file: z.string().optional(),
        input_excerpt: z.string(),
        output: z.string(),
        status: z.enum(["pending", "accepted", "rejected", "partial"]),
      },
      execute: async (args) => recordSuggestion(args), // 返回 { id }
    }),
  },
})
```

实现要点：

- `convertCsvToLatex`：papaparse 解析 → 首行作表头 → 数值列右对齐（`r`）、文本列左对齐（`l`）→ booktabs 三线（`\toprule`/`\midrule`/`\bottomrule`）→ 特殊字符转义（`% & _ #`）→ 包 `table` 环境 + caption + label。纯函数，无 IO 依赖除 `Bun.file(args.file).text()`。
- `convertMdToLatex`：markdown-it token 流 → 自定义 renderer：heading→`\section*{}` 层级映射、bullet/ordered list→`itemize`/`enumerate`、inline code→`\texttt{}`、 fenced code→`lstlisting`、`$...$` 原样透传、table token→复用 table 生成器。**不引入 pandoc**，控制转换白名单，遇到不支持的 token 原样保留并加 `% TODO: unsupported` 注释。
- `upsertBibtex`：解析现有 `refs.bib` 提取全部 key → 过滤重复（skipped）→ 追加新条目（文件末尾，保持原有顺序不动）。该 tool 只被 diff review 确认后的流程调用。

### 6.2 引用助手流程（cite_assist，Skill 编排）

```
1. 用户在编辑器选中段落（或取光标所在段）→ 前端把段落文本发给 Agent Dock
2. cite-assist Skill 指示模型：
   a. 从段落提取 3-5 个检索 query（术语 + 断言句）
   b. 逐个调用 researchos-library_search_papers（P1 提供，本地 SQLite + sqlite-vec）
   c. 合并去重 → 按相关度排序取 top 5
   d. 对每篇给出"为何相关"一句话理由
3. 前端引用标签页渲染推荐卡片（标题/作者/年份/理由）
4. 用户点击"插入引用"：
   a. 模型用 OpenCode edit 工具在段落句末插入 \cite{key}  → 走原生 diff review
   b. 确认后调用 bibtex_upsert 把 BibTeX 追加进 refs.bib（同样经 diff review）
   c. 调用 suggest_record(kind="cite") + 写 writing_citation 表
5. 若文献库检索为空 → 提示"本地库无相关文献，请到文献中心检索"，不联网兜底
```

### 6.3 润色流程（rewrite，diff review 关键路径）

```
1. 前端取选区文本 + style → SubAgent 走 academic-polish Skill
2. 模型返回重写文本（约束：只改语言不改事实，保留所有 \cite/\ref/数学环境原样）
3. 前端用 jsdiff 做词级 diff，按句切分为 hunk 列表
4. 渲染 diff 视图：删除红色删除线、新增绿色，每 hunk 独立 接受/拒绝
5. 用户完成 review → 前端把最终文本拼回，调用 edit 工具落盘（OpenCode 原生确认流）
6. 逐 hunk 写 writing_rewrite_hunk，suggestion 置 accepted/partial/rejected
```

`writing.suggest_titles` / `suggest_structure` / `code_to_algorithm` 均为单次 LLM 生成，出参与总体方案 5.5 一致；生成结果一律先呈现在侧栏卡片中，用户点"采纳"后才通过 edit 工具写入文件（结构骨架则生成新文件 `paper/sections/*.tex` + 在 `main.tex` 插入 `\input{}`，同样走 diff review）。

## 7. SubAgent 与 Skill 定义

### 7.1 `.opencode/agent/paper-writer.md`

```markdown
---
description: Academic paper writing assistant — titles, structure, polishing, algorithms, tables, citations
mode: subagent
color: green
permission:
  edit: ask
  bash: deny
---

You are the ResearchOS paper-writing assistant. You help researchers write
LaTeX papers: generating candidate titles, proposing section structures,
polishing prose into academic style, converting code to Algorithm2e
pseudocode, converting CSV/Markdown to LaTeX, and recommending citations
from the local literature library.

Hard rules:
- NEVER rewrite files silently. Every change to a .tex or .bib file goes
  through the edit tool so the user reviews a diff.
- Preserve all \cite{...}, \ref{...}, math environments, and labels
  verbatim when polishing. Only change prose.
- Never invent citations. Only cite papers returned by the
  researchos-library tools; if the library has nothing relevant, say so.
- Keep a formal, concise academic tone. Prefer active voice unless the
  user asks for passive.

Available skills: paper-titles, paper-structure, academic-polish, algo2e,
cite-assist. Use table_to_latex / md_to_latex / bibtex_upsert tools for
deterministic conversions instead of generating them yourself.
```

### 7.2 `.opencode/skill/academic-polish/SKILL.md`（代表性示例）

```markdown
---
name: academic-polish
description: Rewrite selected prose in academic style (academic/concise/passive) without altering facts, citations, or math
---

# Academic Polish

Input: a text selection and a style: `academic` | `concise` | `passive`.

## Procedure

1. Identify all protected spans: `\cite{...}`, `\ref{...}`, `\label{...}`,
   inline `$...$` and display math, URLs, and proper nouns. Treat them as
   opaque tokens.
2. Rewrite the remaining prose per style:
   - `academic`: formal register, hedged claims ("suggests", "indicates"),
     precise terminology.
   - `concise`: remove filler, split >40-word sentences, prefer strong verbs.
   - `passive`: convert to passive voice where the actor is unimportant.
3. Reinsert protected spans at their original logical positions.

## Output contract

Return ONLY the rewritten text, no commentary, no markdown fences.
The length must stay within ±20% of the input. Do not add claims,
numbers, or citations that are not in the input.
```

### 7.3 其余 Skill 要点

- `paper-titles/SKILL.md`：输入摘要 + 关键词，产出 N 个候选标题，风格多样化（陈述式 / 问题式 / "X for Y" 式），每个附一句命名理由；输出 JSON 数组。
- `paper-structure/SKILL.md`：输入研究方向 + venue（如 `neurips`/`ieee-access`），输出标准骨架（Introduction → Related Work → Method → Experiments → Conclusion），每节给 3-5 条要点 outline；venue 有官方模板时在输出顶部注明页数/栏数约束。
- `algo2e/SKILL.md`：输入源文件路径（+ 可选函数名），先用 OpenCode 原生读文件工具读代码，提炼主流程 → Algorithm2e 环境（`\KwIn/\KwOut`、`\While`、`\For`、`\uIf`），去掉语言细节（类型、import、日志），每步一行伪代码；输出去掉 markdown fence 的纯 LaTeX。
- `cite-assist/SKILL.md`：按 6.2 节流程执行，强调"只用文献库返回的条目，禁止编造 BibTeX 字段"。

## 8. 前端界面落地

按 UI 设计 3.7，写作助手**不是独立路由**，而是 LaTeX 编辑器页面内的右侧栏面板。

- 编辑器页面本体（模块 P3 提供）：`packages/app/src/pages/latex.tsx`。
- 本模块新增组件目录：`packages/app/src/pages/latex/writing/`
  - `panel.tsx` — 侧栏容器，五个标签页：`标题` `结构` `润色` `排版` `引用`。用 `@opencode-ai/ui` 的 `Tabs` + `IconButton`，主题令牌 `bg-background-base` / `border-border-base`。
  - `titles-tab.tsx` — 候选标题卡片列表（`Card`），每张卡片"采纳"按钮触发 `\title{}` 替换（走 edit diff）。
  - `structure-tab.tsx` — 左：建议骨架树；右：当前大纲（从编辑器 buffer 解析 `\section`）；差异高亮（新增节绿、缺失节灰）。"生成骨架文件"按钮。
  - `polish-tab.tsx` — 选区原文 + 风格选择（`Select`）→ jsdiff 词级 diff 视图（复用 OpenCode review 交互组件，删除红/新增绿），hunk 级接受/拒绝 `Checkbox`，底部"应用所选"。
  - `typeset-tab.tsx` — 三个子入口：代码文件/函数选择 → Algorithm2e 预览；CSV 文件选择 → 表格预览；MD 笔记选择 → LaTeX 预览。预览均为只读代码块（mono 字体）+ "插入到当前文件"按钮。
  - `citations-tab.tsx` — 当前段落展示、推荐文献卡片（标题/作者/年份/AI 理由）、每卡"插入 \cite"按钮；底部显示 `refs.bib` 将追加的 BibTeX 预览。
- 侧栏入口：编辑器页内部开关，**不改动** `sidebar-shell.tsx` 的 icon rail（icon rail 的 ✎ 入口与 𝌆 指向同一路由，✎ 仅额外携带 `?panel=writing` 打开侧栏）。
- 与 Agent 的连接：各标签页通过前端 session 上下文向 paper-writer SubAgent 发消息（携带选区/当前文件/段落），响应流式渲染到对应标签页；文件写入由 SubAgent 的 edit 工具发起，前端复用 OpenCode 已有的 diff 确认 UI。

## 9. 开发步骤与里程碑

依赖：P0（插件规范、SQLite 底座）、P1（文献库 + `researchos-library` MCP，仅引用助手需要）、P3 的 LaTeX 编辑器页面（前端嵌入点）。

| 周 | 任务 | 依赖 |
| --- | --- | --- |
| W1 | 建 `packages/researchos-writing` 包骨架；实现 `table_to_latex` + `md_to_latex` + 单测；写 SQLite migration（3 张表） | P0 |
| W2 | 实现 `bibtex_upsert`（key 查重）+ `suggest_record`；opencode.json 注册插件，验证 4 个 tool 在会话中可见可调 | W1 |
| W3 | 编写 5 个 SKILL.md + paper-writer SubAgent；跑通"润色选段 → edit diff"与"CSV → 插入表格"两条链路 | W2 |
| W4 | 前端：`panel.tsx` + `titles-tab` + `structure-tab`（大纲解析与差异视图） | P3 编辑器页面 |
| W5 | 前端：`polish-tab`（jsdiff hunk review）+ `typeset-tab`；hunk 结果落库 | W3, W4 |
| W6 | `citations-tab` + cite-assist Skill 联调（接 P1 检索）；`writing_citation` 落库 | P1, W3, W4 |
| W7 | 端到端联调：摘要 → 标题 → 骨架 → 润色 → 插表 → 引用 → 编译通过；补集成测试与文档 | 全部 |

## 10. 测试方案

全部测试放 `packages/researchos-writing`，在该目录下跑 `bun test` 与 `bun typecheck`（**不在 repo 根目录跑测试**）。

- **单测**（`packages/researchos-writing/test/`）：
  - `table-to-latex.test.ts`：CSV 引号/逗号/换行边界、数值列对齐、特殊字符转义、空文件报错。
  - `md-to-latex.test.ts`：heading/list/code/math/table 各 token 的快照测试；不支持的 token 产出 TODO 注释。
  - `bibtex.test.ts`：key 提取、重复 key 跳过、追加后文件仍是合法 BibTeX。
  - `migrations.test.ts`：三张表建表幂等（跑两次不报错）。
- **集成测试**：
  - 用 OpenCode 插件测试入口加载 `WritingPlugin`，直接调用各 tool 的 `execute`，断言返回结构与 5.5 契约一致（不 mock 文件系统，用 `Bun.mkdtemp` 临时目录放真实 CSV/MD/bib）。
  - cite 流程：临时 SQLite 建最小 paper 表 + 插入 3 条文献，验证检索 → upsert → `writing_citation` 落库全链路。
- **Skill/SubAgent 验证**：不跑自动化 LLM 测试；用固定样例（一段英文、一个 Python 函数）人工走查输出格式符合 SKILL.md 的 output contract，把样例输入/期望结构留在 `test/fixtures/` 供回归对照。
- 前端组件沿用 packages/app 现有测试约定；diff hunk 切分逻辑抽成纯函数后在 writing 包内单测。

## 11. 风险与开放问题

1. **润色破坏 LaTeX 语义**：模型可能误改 `\cite`/数学环境。缓解：SKILL.md 明确 protected spans + 输出长度约束 + diff review 兜底；后续可加编译后校验（edit 应用后自动触发 `latex.compile`，失败则提示回滚）。
2. **引用幻觉**：模型绕过文献库自行编造 BibTeX。缓解：SubAgent prompt 硬性禁止 + `bibtex_upsert` 只接受带 `paper_id` 来源的条目（开放问题：是否在 tool 层强制校验 paper_id 存在于文献库，待 P1 接口冻结后决定）。
3. **MD→LaTeX 覆盖率**：markdown-it 白名单转换对复杂笔记（嵌套列表、脚注、HTML）会降级为 TODO 注释。开放问题：是否引入 pandoc 作为可选后端（GPL-2.0，外部二进制，需用户自装）。
4. **代码转伪代码质量不稳定**：Algorithm2e 生成依赖模型对代码的理解，长函数效果差。缓解：Skill 引导先按函数切分；MVP 只承诺单函数粒度。
5. **与 LaTeX 编辑器模块的边界**：侧栏嵌入方式、选区 API、大纲解析归属（编辑器模块还是写作模块）需与 P3 编辑器开发对齐，建议大纲解析放编辑器侧、写作模块订阅其结果。
6. **SubAgent 标签配色**：UI 设计规定绿色=写作，已在 agent frontmatter `color: green` 落实，若 OpenCode 版本不支持自定义颜色字段则需降级为名称前缀约定。
