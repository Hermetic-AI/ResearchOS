# 模块十：全文翻译中心（Translation）技术落地文档

> 实现状态（2026-07-29）：P5 v1 已完成。归档 PDF 由 PyMuPDF 真实提取，TS 管线执行章节切分与公式/数值/引用保护，并调用用户配置的 LibreTranslate 兼容端点；未配置引擎时明确失败或交由 Translator SubAgent，不生成伪译文。App 已提供原文/译文/双语视图与归档加载。

对应总体方案《ResearchOS最终方案.md》§三 模块十、§五 5.9 接口契约；UI 对应《ResearchOS-UI设计.md》§3.3 末尾「全文翻译」部分；依赖模块一（文献库，见 `docs/modules/01-literature.md`）与模块九（API Hub，见 `docs/modules/09-api-hub.md`）。

## 1. 模块概述与目标

全文翻译中心为文献中心提供**学术级英→中全文翻译**：从文献库已归档的 PDF 出发，经「PyMuPDF 全文提取与结构化 → 翻译 API 初译 → AI 模型学术润色」三级协同管线，产出覆盖摘要、引言、相关工作、方法/系统设计、实验、结论等章节的 `translation_zh.md`；数学公式与关键实验数据保留原文，文末附自动抽取的中英术语对照表；课题级术语库跨论文累积复用，保证同一课题内译法一致。Agent 侧由 Translation SubAgent 编排，用户侧在文献详情页提供翻译入口、三阶段进度与「原文 / 译文 / 双语对照」阅读视图。

设计取舍一句话：**API 负责速度与覆盖，LLM 负责质量与术语**——翻译 API（LibreTranslate 自托管免费 / DeepL Free 每月 50 万字符）以极低成本覆盖全文，LLM（走 opencode 原生 provider，无新增计费）只做学术润色与术语对齐，把昂贵模型调用限制在必要环节。

## 2. 功能清单与范围边界

**做：**

- PDF 全文提取与结构化：PyMuPDF `page.get_text()` 按块提取，分类为标题/段落/公式/表格/图注，重建 Markdown 骨架（内部格式转换为 MD）。
- 协同翻译三级管线：API 初译（LibreTranslate / DeepL Free，经 API Hub 纳管）→ LLM 学术润色（术语一致性、学术语气、长句重组、修复初译的公式上下文错乱）；`engine: "auto" | "api" | "llm"` 可选。
- 分节处理：按章节（abstract / introduction / related work / method / experiments / conclusion）切分与翻译，支持 `sections` 只译指定章节。
- 原文保真规则：数学公式（`$...$` / `\[...\]` / 公式块）、关键实验数据、图表引用（Fig. 3 / Table 2）、算法伪代码保留原文不译，译文中原文 + 中文注释并置。
- 术语对照表：LLM 从译文抽取领域术语生成中英对照表附于文末；课题级 `glossary_term` 表累积复用，人工修正写回（`translate.glossary_update`）。
- 双语对照阅读：文献详情页「原文 | 译文 | 双语对照」三态切换，段落级对齐（`translation_segment` 表），`translate.export_bilingual` 导出 MD/HTML 对照文档。
- 产物归档：`.researchos/translations/<paper_id>/`（`translation_zh.md`、`bilingual.html`、`meta.json`），纳入课题 Git 管理。

**不做（本期范围外）：**

- 多语言互译（只做 en→zh；目标语言参数化预留，后续迭代）。
- 实时划词翻译 / 选中即译（属阅读器能力，待 PDF 阅读器模块再议）。
- 扫描版 PDF 的 OCR（只处理有文本层的 PDF；无文本层时明确报错并提示）。
- 译文反向润色为英文（属模块五写作助手的 academic-polish Skill）。
- 翻译记忆库（TM）级别的句对复用（本期只做术语级复用，句子级缓存留给后续）。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| PDF 全文提取 | PyMuPDF（`fitz`，`doc[i].get_text("dict")`） | 块级提取带 bbox/字号/字体元数据，是公式与版式分类的前提；模块四已有 Python venv 基建可复用 | AGPL-3.0（自托管本地使用，不分发衍生作品） |
| 翻译 API（首选） | LibreTranslate（自托管，Docker） | 免费、无额度限制、可离线；经 API Hub adapter 调用 | AGPL-3.0 |
| 翻译 API（备选） | DeepL API Free | 质量更高，50 万字符/月免费额度；key 经 `researchos.api.deepl.key` 配置 | DeepL API Free 条款 |
| LLM 润色 | opencode 原生 LLM provider | 无新增计费、复用已配置 credential；**不经 API Hub 接管**（平台级 API，见模块九分类原则） | — |
| 翻译内核 | 新 TS 包 `@researchos/translate` | 编排、分块、保真、术语库、SQLite——与 MCP/handler 两侧复用 | — |
| Python 侧提取 | `packages/researchos-mcp/translate`（FastMCP + uv） | 承载 PyMuPDF；沿用模块四 `researchos-mcp/*` 模式 | MIT（`mcp` SDK） |
| 存储 | SQLite（`bun:sqlite`，复用文献库 `literature.db` 同库） | 翻译任务/术语/段落对齐与文献天然关联；零新依赖 | Public Domain |
| 参数校验 | zod | 仓库统一 | MIT |

不引入的：翻译厂商 SDK（googletrans、deepl-python 等——薄 fetch + zod 即可，条款友好）、PDF 解析的 TS 方案（pdfjs 无块级字体元数据，保真分类做不了，故提取放 Python）。

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| PDF 提取与块分类 | **Python FastMCP server** `packages/researchos-mcp/translate`，暴露 `extract_pdf` 工具（返回结构化块 JSON） | PyMuPDF 只在 Python 生态；沿用模块四 `researchos-mcp/*` 的 uv/FastMCP 既有模式，不新开技术栈 |
| 翻译编排（分块、API 初译、术语库、SQLite、产物组装） | **TS 包** `@researchos/translate`（`packages/researchos-translate`） | 编排逻辑被 MCP tool 与 server handler 两侧复用；与文献库同库操作；独立包可单测 |
| 翻译 API 调用 | `@researchos/api-hub` 新增 `libretranslate` / `deepl` 两个 adapter | 总体方案既定「外部 API 必须经 API Hub」；限流/缓存/key/额度统计天然复用 |
| **LLM 润色：选 `.opencode/agent/translator.md` SubAgent，不在工具内直调 provider** | SubAgent 经 TaskTool 调用，内部用 read/write 对分节文件做润色 | 三个理由：① opencode 的工具/plugin 内没有稳定的「再发起一次 LLM 调用」公共 API，SubAgent 是原生提供的唯一免新计费推理通道；② 润色 prompt 需随学科迭代，markdown 定义可热改、可进 preset 分发；③ 润色是长上下文任务，独立 SubAgent 有干净上下文窗，不与主会话抢窗 |
| `translate.*` 接口承载 | **双通道**：Agent 面 = MCP tool（`@researchos/mcp-translate`，薄 TS stdio server，编排调 Python 提取 + Hub + 触发润色）；前端面 = protocol 新 group `researchos-translation` + server handler（`packages/server/src/handlers/translation.ts`），handler 直接 import `@researchos/translate`，`packages/client` 跑 `bun run generate` | 与模块一/六一致的双通道事实：MCP 给 Agent，HttpApi 给前端；plugin tool 不采用（无 ToolContext 需求，避免双份实现） |
| 翻译任务进度 | `translation_job` 表为唯一事实源；MCP 侧 `translate.status` 轮询，前端 handler 暴露同名 endpoint 轮询（间隔 2s，终态停止） | 与模块六复现流水线同一模式，不引入 SSE/WebSocket 新机制 |

**润色编排细节**：`@researchos/translate` 的编排器完成 ①②级（提取 + 初译）后，把「待润色分节 MD + 术语库」写到 `.researchos/translations/<paper_id>/staging/`，然后由**调用方**（主 Agent 会话，或 SubAgent 自身）按节调用 translator SubAgent 完成第③级并写回。也就是说工具内不嵌 LLM 调用，「LLM 参与」由 SubAgent 协议承担——这是把「无新增计费」落到原生机制上的关键决策。`engine: "api"` 时跳过第③级直接产出。

依赖方向：`@researchos/translate` 依赖 `@researchos/api-hub` 与 `@researchos/literature`（只读 paper/pdf_path），不依赖任何 opencode 包；MCP server 与 server handler 分别依赖它，方向安全。

## 5. 数据模型与存储

### 目录约定（课题工作区内）

```
<project>/.researchos/
└── translations/
    └── <paper_id>/                  # paper_id 与文献库一致
        ├── source.md                # ①级产物：提取重建的英文 MD 骨架
        ├── staging/                 # ②级中间态：分节初译稿 sec-01.zh.md …
        ├── translation_zh.md        # 最终译文（含文末术语对照表）
        ├── bilingual.html           # 段落级双语对照（translate.export_bilingual 产物）
        └── meta.json                # { job_id, engine, api_used, sections, created_at, term_count }
```

SQLite 表加进文献库同一个 `literature.db`（`packages/researchos-translate/src/schema.sql`）：

```sql
CREATE TABLE IF NOT EXISTS translation_job (
  id            TEXT PRIMARY KEY,          -- job_id（nanoid）
  paper_id      TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  engine        TEXT NOT NULL DEFAULT 'auto',   -- auto | api | llm
  sections      TEXT,                      -- JSON array；NULL = 全文
  state         TEXT NOT NULL DEFAULT 'extracting',
                -- extracting | translating | polishing | done | failed
  progress      REAL NOT NULL DEFAULT 0,   -- 0..1
  current_section TEXT,
  api_used      TEXT,                      -- libretranslate | deepl | none
  chars_translated INTEGER DEFAULT 0,      -- DeepL 额度统计用
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_term ( -- 课题级术语库，跨论文复用
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  en      TEXT NOT NULL,
  zh      TEXT NOT NULL,
  domain  TEXT NOT NULL DEFAULT 'general', -- 学科领域标签
  source  TEXT NOT NULL DEFAULT 'auto',    -- auto | manual
  paper_id TEXT,                           -- 首次来源论文（溯源用，可空）
  use_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (en, domain)                      -- 同一领域内英文术语唯一
);

CREATE TABLE IF NOT EXISTS translation_segment ( -- 段落级对齐（双语对照视图源）
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id   TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,                -- abstract / introduction / ...
  seq        INTEGER NOT NULL,             -- 段落在全文中的序号
  kind       TEXT NOT NULL DEFAULT 'paragraph',
             -- heading | paragraph | formula | table | caption | code
  source_text TEXT NOT NULL,               -- 原文段
  target_text TEXT,                        -- 译文段（公式/数据段为 NULL，前端按保真样式渲染）
  UNIQUE (paper_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_job_paper ON translation_job(paper_id);
CREATE INDEX IF NOT EXISTS idx_segment_paper ON translation_segment(paper_id, section);
```

## 6. 核心接口实现

### 6.1 三级管线总览

```
translate.paper(paper_id, sections?, engine="auto")
  ├─ ① 提取（Python FastMCP: extract_pdf）
  │     PyMuPDF doc[i].get_text("dict") → 块分类 → source.md + translation_segment(source)
  ├─ ② 初译（@researchos/translate，经 api-hub）
  │     分块（按节 + token 预算）→ LibreTranslate/DeepL → staging/sec-*.zh.md
  └─ ③ 润色（translator SubAgent，engine ≠ "api" 时）
        逐节读 staging 稿 + 术语库 → 学术润色 → 写回 → 组装 translation_zh.md + 术语表
```

### 6.2 ①级：PyMuPDF 块提取与分类（`packages/researchos-mcp/translate/`）

`extract_pdf(pdf_path) -> { blocks: [{kind, text, page, bbox}] }`，逐页 `page.get_text("dict")` 拿 block → line → span（含 `size`、`font`、`flags`）：

```python
def classify(block, page_width) -> str:
    text = flatten(block)
    if block["type"] == 1:                      return "image"        # 图片块，跳过（记录占位）
    if is_display_formula(block):               return "formula"      # 见保真规则
    if re.match(r"^(Figure|Fig\.|Table)\s*\d+", text): return "caption"
    if max_span_size(block) >= heading_threshold(doc): return "heading" # 字号显著大于正文
    if looks_like_table(block):                 return "table"        # 多短行、列对齐、含大量数字
    if re.match(r"^(Algorithm\s*\d+|Procedure\b)", text): return "code"  # 伪代码
    return "paragraph"
```

**保真判定规则**（判为保真块的整段不送 API，原样进 MD）：

- 行内公式：span 字体为数学字体（`CMMI`/`CMSY`/`Symbol`/`MT Extra`，或 `flags & 2**4` 斜体 + 单字符希腊/符号密度高）→ 转 `$...$` 包裹原文。
- 独立公式块：块内符号字符（`= ∫ ∑ ∂ √ ≤ ≈` 等）占比 > 30%，且平均行长 < 正文一半，且右侧有 `(12)` 式编号模式 → 公式块，转 `\[...\]`。
- 关键数据：段内正则 `数值+单位`（`\d+(\.\d+)?\s*(%|ms|s|GB|MB|Hz|K|M|×10\^?[-\d]+)`）与置信区间/p 值（`p\s*[<=>]`、`95%\s*CI`）命中的**句子级**片段，在译文中保留原数值串——不整段保真，只保真数值 token。
- 图表引用：`Fig\.?\s*\d+[a-z]?`、`Table\s*\d+`、`Equation\s*\(\d+\)`、`Section\s*\d+(\.\d+)*` 命中 token 不译。
- 伪代码：整块保真，用 fenced code block 包裹。

MD 骨架重建：heading 按字号层级映射 `#`/`##`/`###`；双栏 PDF 按 bbox.x 与栏中线聚类重排阅读序（先左栏从上到下、再右栏）；页眉页脚（每页同位置重复文本、页码模式）剔除。每段写一行 `translation_segment(source)`，为双语对齐打底。

### 6.3 ②级：分块策略 + API 初译（`@researchos/translate/src/translate.ts`）

```ts
// 伪代码
const sections = splitByHeading(sourceMd, opts.sections)   // 按节切分；sections 过滤
for (const sec of sections) {
  const chunks = packChunks(sec, { budget: 4000 /* chars */ })
  // 段落为原子单位，不跨段切断；超长段按句号再切
  for (const chunk of chunks) {
    const masked = maskProtected(chunk)        // 保真 token 换占位符 __P0__
    const zh = await hub.call(engineAdapter, { text: masked, target: "ZH" })
    yield restore(unmask(zh))                  // 占位符还原
  }
  job.update({ current_section: sec.name, progress: done / total })
}
```

- 分块预算按字符而非 token（翻译 API 按字符计费/限额），默认 4000 字符/块（DeepL 单请求上限 128KB，留足余量）；LibreTranslate 无硬性上限但短块质量更稳。
- `engineAdapter` 选择：`deepl` key 已配置且当月额度未耗尽 → DeepL；否则 `libretranslate`；两者都不可用 → 记 `api_used: "none"`，直接把 source.md 交 ③级全量 LLM 翻译（降级路径，进度提示用户）。
- API 调用全部经 `@researchos/api-hub` adapter（新增 `libretranslate.ts` / `deepl.ts`，薄 fetch + zod 窄 schema），获得限流/重试/缓存/额度统计；缓存 TTL 永久（同文同引擎结果不变）。

### 6.4 ③级：LLM 润色 prompt 设计（translator SubAgent 体内执行）

润色以节为单位，每节一次 SubAgent 调用（上下文干净、失败可单节重试）。prompt 骨架：

```
你正在润色一节学术论文的机器初译稿（英→中）。

【术语库】（必须严格遵循，课题内统一译法）：
<glossary: en → zh 列表，来自 glossary_term 表按 domain 过滤>

【保真约束】（违反视为失败）：
1. $...$ 与 \[...\] 中的公式、数值+单位、Fig./Table/Equation 引用 token 必须原样保留；
2. 不改变任何数字、符号方向与比较关系；
3. 不增删技术内容，只做语言层面改写。

【润色要求】：
- 学术书面语，被动语态酌情转主动；长句按中文习惯拆分重组；
- 修复初译造成的公式上下文错乱（公式前后指代一致）；
- 首次出现的领域新术语：译文 + （English term）并置，并在回复末尾
  以 JSON 列出新术语对 [{"en":..., "zh":...}]，供写入课题术语库。

【初译稿】：...
【原文对照】：...（source 段，供核对）
```

SubAgent 返回的新术语对经 `glossary_term` upsert（`UNIQUE(en, domain)` 冲突时更新 `use_count+1`，不覆盖 manual 条目），下次翻译自动生效——术语复用闭环。

### 6.5 `translate.*` 签名与实现要点

与总体方案 §5.9 契约一致。MCP tool 与前端 endpoint 共用 `@researchos/translate` 的同一实现：

- `translate.paper({ paper_id, target_lang?, sections?, engine? })`：查文献库取 `pdf_path`（无 PDF 报错）→ 建 `translation_job` 行 → 异步跑三级管线 → 返回 `{ job_id, md_path }`。同一 paper 已有 done 产物且参数相同 → 直接复用返回。
- `translate.status({ job_id })`：读 `translation_job`，返回 `{ state, progress, current_section?, error? }`。
- `translate.glossary({ paper_id })`：该论文涉及的术语（`paper_id` 溯源 + 课题全库按 domain 命中），返回 `{ terms: [{en, zh, source}] }`。
- `translate.glossary_update({ paper_id, terms })`：人工修正 upsert，`source: "manual"`；manual 条目永不被 auto 覆盖；同时改写 `translation_zh.md` 文末术语表相应行。
- `translate.export_bilingual({ paper_id, format })`：按 `translation_segment` seq 拼接——`md` 为「原文段 + 译文段」交替，`html` 为两栏 table（前端对照视图同源逻辑复用），写 `bilingual.html` / `bilingual.md`，返回 `{ path }`。

组装 `translation_zh.md` 末尾固定附「术语对照表」节（`| English | 中文 |` 表格，本论文实际出现的术语）。译文中的 `[[概念]]` 双链由知识图谱模块（模块二）统一扫描 `.researchos/translations/` 建链，本模块不感知。

## 7. SubAgent 与 Skill 定义

### `.opencode/agent/translator.md`

```markdown
---
description: 学术翻译专家。负责论文英译中的学术润色：术语一致性、学术语气、长句重组、公式与数据保真。当任务涉及翻译论文、润色译文、统一术语译法时使用。
mode: subagent
model: inherit
color: "#c678dd"
permission:
  translate_paper: allow
  translate_status: allow
  translate_glossary: allow
  translate_glossary_update: allow
  translate_export_bilingual: allow
  extract_pdf: allow
  read: allow
  write: allow
  edit: deny
  bash: deny
---

你是 ResearchOS 的学术翻译 SubAgent，负责论文英译中管线的 LLM 环节。工作准则：

1. 收到润色任务时，输入是 staging/ 下的分节初译稿与对应原文；逐节处理，
   每次只润色一节，完成后立即写回同名文件，不要一次吞全部章节。
2. 术语一致性第一优先级：任务附带的课题术语库必须严格遵循；
   已有译法不得另造新译。新术语首次出现用「译文（English term）」并置，
   并在该节回复末尾以 JSON 列出新术语对，格式 [{"en":"...","zh":"..."}]。
3. 保真红线：$...$ / \[...\] 公式、数值+单位（如 3.2%、128 ms）、
   Fig. 3 / Table 2 / Equation (4) 引用 token 一律原样保留，不得翻译或改写数字。
4. 语言要求：学术书面中文；长句按中文习惯拆分；被动语态酌情转主动；
   修复初译造成的公式上下文指代错乱（如「该式」指错公式时按原文核对修正）。
5. 只改写语言，不增删技术内容；发现初译明显错译且无法确定时，
   保留原文并加「（译注：原文存疑）」，禁止编造。
6. 全文翻译流程：translate_paper 启动 → translate_status 轮询到 translating 完成 →
   逐节润色 → 全部完成后确认产物 translation_zh.md 与文末术语表已生成。
```

### `.opencode/skill/academic-translation/SKILL.md`

```markdown
---
name: academic-translation
description: 学术论文英译中的翻译规范与流程。当用户要求翻译论文、生成中文全文译文、统一术语译法或导出双语对照时使用。
---

# Academic Translation

把文献库中的论文翻译为学术级中文全文译文 `translation_zh.md`。

## 流程

1. 定位文献：paper_id（或先经 literature 模块入库拿到 paper_id）。
2. 启动翻译：`translate_paper(paper_id, sections?, engine?)`——
   默认 engine="auto"（API 初译 + LLM 润色）；用户只要快速草稿用 "api"，
   无可用翻译 API 时降级 "llm" 并明确告知用户成本更高。
3. 轮询 `translate_status(job_id)`：extracting → translating → polishing → done。
   translating 完成后，逐节执行润色（见下），再确认组装完成。
4. 向用户汇报：产物路径、章节覆盖、术语表规模；提示可在文献详情页
   切换「原文 / 译文 / 双语对照」阅读。

## 翻译规范（润色时必读）

- **术语一致性**：课题术语库（translate_glossary 可查）中的译法必须沿用；
  新术语首次出现「中文（English）」并置；同一节内同一术语不得两种译法。
- **公式处理**：行内 $...$ 与独立 \[...\] 公式原文保留；公式前后的
  「其中 / where」从句照常翻译，符号指代必须与公式内一致。
- **数据保真**：所有数值+单位、百分比、p 值、置信区间原样保留；
  表格中的数字列不译。
- **引用保真**：Fig. 3、Table 2、Equation (4)、Section 3.1、[12] 等引用
  token 不译。
- **学术语气**：书面语；避免口语词（「搞」「东西」）；长句拆分；
  「we」译「本文」而非「我们」（视上下文）。

## 术语表维护

- 每节润色末尾以 JSON 列出新术语对，由管线写入课题术语库。
- 用户人工修正术语（translate_glossary_update）后，提示「后续翻译自动遵循，
  是否同步改写当前译文中的旧译法」。
```

## 8. 前端落地

对应 UI 设计 §3.3 末尾「全文翻译」。全部改动集中在 `packages/app/src/pages/literature/` 既有详情页内，无新路由：

- `detail-panel.tsx` 操作区新增 `全文翻译` 按钮 → 弹出选项（章节多选、引擎 auto/api/llm）→ 调 generated client 的 `translation.paper` endpoint。
- `translate-progress.tsx`（新）：三阶段进度条——`提取 → 初译 → 润色`，映射 `translation_job.state`；进度数据轮询 `translation.status` endpoint（间隔 2s，`done`/`failed` 终态停止，与模块六 Stepper 同一模式）；完成 toast 并显示 `translation_zh.md` 产物徽标。
- `reading-view.tsx`（新）：`原文 | 译文 | 双语对照` 三态切换器。原文读 `source.md`，译文读 `translation_zh.md`（经 handler 的文件读取 endpoint），双语对照按 `translation_segment` 段落级左右渲染，hover 某段两侧同步高亮；`kind = formula` 段用保真样式（原文 + 浅底纹 + 中文注释）。
- `glossary-tab.tsx`（新）：详情页新增「术语对照表」tab——中英术语表格（`translation.glossary`），行内可编辑修正（保存 → `translation.glossary_update`，写回课题术语库），`导出对照文档`按钮（`translation.export_bilingual`，MD/HTML 选择）。
- 组件复用：Markdown 渲染复用 app 既有组件；配色遵循主题令牌，本模块强调色沿用文献蓝 `#61afef`，保真块用 `bg-surface-raised-base` 底纹。
- 数据通道：`packages/protocol/src/groups/researchos-translation.ts`（新文件）注册进 `api.ts` 单行追加；`packages/server/src/handlers/translation.ts`（新文件）薄转发到 `@researchos/translate`；`packages/client && bun run generate`；前端只走 generated client。

## 9. 开发步骤与里程碑

| 周 | 任务 | 依赖 |
| --- | --- | --- |
| W1 | `packages/researchos-mcp/translate` Python 骨架（uv + FastMCP）：PyMuPDF 块提取、分类规则、保真判定、MD 骨架重建；fixture PDF 单测 | 模块四 venv/uv 模式已确立 |
| W2 | `@researchos/translate` 骨架：schema.sql（三表迁移进 literature.db）、分块器、占位符保真 mask/unmask、`translation_segment` 写入 | 模块一文献库可用（paper/pdf_path）；W1 |
| W3 | API Hub 新增 `libretranslate` + `deepl` adapter（含月度字符额度统计）；②级初译链路端到端（`engine: "api"` 可产出全文） | 模块九 API Hub 已落地；W2 |
| W4 | `.opencode/agent/translator.md` + `academic-translation` Skill；③级润色编排（staging 写读、术语注入、新术语回写 `glossary_term`）；`translation_zh.md` 组装与术语表附尾 | W3 |
| W5 | protocol group + server handler + client generate；`translate.*` 五接口双通道接线（MCP tool + endpoint） | W3、W4 |
| W6 | 前端：翻译按钮/三阶段进度/三态阅读视图/术语表 tab；`export_bilingual`；端到端联调与验收 | W5 |

里程碑验收：W3 末对一篇 arXiv 论文跑出 API 初译全文（公式保真）；W4 末 `auto` 管线产出带术语表的润色版 `translation_zh.md`；W6 末文献详情页完成「点翻译按钮 → 看进度 → 双语对照阅读 → 修正术语」闭环。

## 10. 测试方案

遵守仓库规则：测试在包目录内运行（`packages/researchos-translate` 下 `bun test`，`packages/researchos-mcp/translate` 下 `uv run pytest`），不在 repo 根跑；typecheck 在包目录 `bun typecheck`。

**Python 侧**（`uv run pytest`）：

- 块分类：2–3 个 fixture PDF（选 arXiv 开放获取论文，注意 license）放 `tests/fixtures/`，断言 heading/paragraph/formula/caption/table 分类结果与块数；含一个双栏论文验证阅读序重排。
- 保真判定：构造含 `$E=mc^2$`、`\[...\]`、`Fig. 3`、`3.2% (p < 0.05)` 的合成文本，断言保真 token 全部命中；误判率人工抽检记录。
- 无文本层 PDF（图片型）→ 明确报错路径。

**TS 侧**（`bun test`，不打真 API）：

- 分块器：段落原子性（不跨段切断）、超长段二次切分、预算边界。
- mask/unmask：保真 token 与占位符往返无损。
- 初译链路：api-hub adapter 用录制 fixture（LibreTranslate/DeepL 响应 JSON 入库）做传输级测试；DeepL 额度耗尽 → 降级 LibreTranslate / `api_used: "none"` 分支。
- SQLite：三表迁移、glossary `UNIQUE(en, domain)` upsert 语义（manual 不被 auto 覆盖）、segment 对齐唯一键。
- `export_bilingual`：segment 拼接快照比对（md/html）。
- MCP/endpoint 集成：InMemoryTransport 调 `translate_status` 等只读接口断言契约；真 API 冒烟（`RESEARCHOS_LIVE=1`）默认跳过。

③级润色不做自动化断言（LLM 输出非确定），用固定小章节做人工评审 checklist（术语遵循、保真红线）。

## 11. 风险与开放问题

1. **双栏 PDF 文本顺序错乱**：bbox 栏聚类重排对非标准版式（通栏图、三栏、边注）仍可能错序。缓解：错序只影响阅读顺序不影响逐段翻译质量；`source.md` 落盘可人工检查；后续可接 GROBID 结构化输出（模块一已可选部署）替换规则重排。
2. **公式识别误判**：正文中斜体变量易被误判为公式块、真公式缺字体元数据时漏判，导致漏译或过度保真。缓解：保真规则保守化（宁可漏保真也不错保真——漏保真的公式经 API 翻译后通常仍可读，错保真会留下整段英文）；误判案例进 fixture 回归。
3. **LibreTranslate 自托管资源占用**：模型加载约需 1–2GB 内存，低配课题机吃力。缓解：默认 disabled，面板引导按需开启；无 Docker 环境自动走 DeepL/LLM 降级。
4. **DeepL 免费额度耗尽**：50 万字符/月约 10–20 篇长文。缓解：api-hub 按 `chars_translated` 月度统计，用量 > 80% 时 UI 黄条提示；耗尽自动降级 LibreTranslate，再降级全 LLM（`api_used` 全程记录在 job 行，可审计）。
5. **长文 LLM 润色成本**：30 页论文逐节润色约消耗数万 token。缓解：`engine: "api"` 提供零 LLM 草稿档；`sections` 支持只润色核心章节（方法/实验）；润色走 `model: inherit` 允许用户配便宜模型。
6. **开放问题**：① 译文与文献库 `notes_md`、知识图谱 `[[概念]]` 的同步时机（当前由模块二自行扫描，未约定事件通知）；② 扫描版 PDF 是否接 OCR（需引入 tesseract/PaddleOCR，体积与收益待评估）；③ 句子级翻译缓存是否值得做（同领域论文句子重复率低，本期倾向不做）。
