# ResearchOS —— 基于 OpenCode 的 AI 原生科研工作站

> 二次开发最终方案（综合 Gemini 技术架构方案 + GPT 产品定位方案 + 需求描述）

---

## 一、项目定位

> **ResearchOS** 是一个基于 OpenCode Agent Framework 二次开发的 AI 原生科研工作站（AI Research Workstation），通过融合文献管理、知识图谱、LaTeX 写作、数据分析与代码复现能力，将科研全生命周期工具链统一到 Agent 驱动的平台中。

核心关系：**OpenCode 是底座 → Skill/SubAgent 是生态 → ResearchOS 是产品**。

不重复建设 Agent 基础设施（CLI / Web / Desktop / Tool Calling / MCP / GitHub 理解能力均已具备），重点建设科研领域 Workspace 与 Research Agent 生态。

### 需求到模块的映射

| 需求 | 落地模块 |
| --- | --- |
| 1. 文献管理模块（类 Zotero） | Literature SubAgent + 文献 Skill 池 |
| 2. 本地 LaTeX 编辑器 | LaTeX Editor 前端组件 + 编译 Skill |
| 3. 知识图谱系统（类 Obsidian） | Knowledge Graph SubAgent + 双链解析引擎 |
| 4. 实验数据分析模块 | Data Analysis SubAgent + Python 沙盒 |
| 5. 论文写作助手 Skill | Paper Writing SubAgent + 写作 Skill 池 |
| 6. 保留 OpenCode 原生能力 | 核心不做侵入式修改，全部外挂接入 |
| 7. 科研绘图模块（类 Prism / Origin / Visio） | Plot SubAgent + 绘图 Skill 池 |
| 8. Agent 资产管理中心（Skill / MCP / Model / Hook 等） | Asset Center 页面 + 原生 composer 入口增强 |

---

## 二、总体架构设计

采用 **"1 个内核中枢 + 5 大专业 SubAgent + 模块化 Skill 池 + 科研知识底座"** 的分层架构：

```
+-------------------------------------------------------------------+
|              ResearchOS UI 层 (Desktop / Web / CLI)               |
|  +----------------+  +----------------+  +---------------------+  |
|  | LaTeX/MD 编辑器 |  | 文献库/阅读器  |  | 知识图谱可视化面板  |  |
|  +----------------+  +----------------+  +---------------------+  |
|  +----------------+                                                |
|  | 科研绘图工作台  |                                                |
|  +----------------+  +---------------------+                        |
|                      | Agent 资产管理中心  |                        |
|                      +---------------------+                        |
+-------------------------------------------------------------------+
                          | (RPC / 进程间桥接)
+-------------------------------------------------------------------+
|             OpenCode Orchestrator（核心调度中枢，不侵入修改）      |
|              - Context Manager   - Task Planner                   |
+-------------------------------------------------------------------+
      |                |                 |                |        |
+-----------+  +---------------+  +--------------+  +-------------+  +--------+
| Literature|  | Knowledge     |  | Data Analysis|  | Paper       |  | Plot   |
| SubAgent  |  | Graph SubAgent|  | SubAgent     |  | Writing     |  | SubAgent|
| (文献)    |  | (图谱)        |  | (数据)       |  | SubAgent    |  | (绘图) |
+-----------+  +---------------+  +--------------+  +-------------+  +--------+
      |                |                 |                |        |
+------------------------------------------------------------------------+
|          统一 Skill 池（MCP 协议封装，Python / TS）                     |
|  Zotero DB · arXiv/Semantic Scholar · PyData · Tectonic · Git           |
|  Plotly/Vega-Lite · drawio · Mermaid · Graphviz                         |
+------------------------------------------------------------------------+
      |                |                 |                |        |
+------------------------------------------------------------------------+
|                     科研知识底座（本地优先）                            |
|  SQLite(文献库) · Markdown Vault · 向量索引 · Git 仓库 · 文件系统       |
+------------------------------------------------------------------------+
```

### 关键架构原则

1. **低侵入原则**：不直接改动 OpenCode 核心 Agent 逻辑，所有新能力以 **Plugin / MCP Server / Skill Package / SubAgent 配置** 的形式外挂接入，降低同步上游更新的成本。
2. **本地优先（Local-first）**：文献库、笔记、图谱数据均存本地（SQLite + Markdown 文件），网络 API 仅用于检索与元数据补全。
3. **统一协议**：所有工具能力通过 MCP（Model Context Protocol）封装，Skill 与 SubAgent 之间通过标准接口调用，保证可维护性与可扩展性。

---

## 三、模块划分与功能设计

### 模块一：文献管理中心（Literature SubAgent）

类似 Zotero，支持搜索、格式转换、引用生成、元数据提取、引用关系提取与相似文献推荐。

**功能清单：**

- **文献智能搜索**：集成 arXiv、Semantic Scholar、Crossref、PubMed API，按关键词/当前论文上下文自动检索。
- **本地文献库**：SQLite 存储文献条目与元数据，兼容导入 Zotero 本地数据库；PDF 统一归档到本地目录。
- **元数据提取**：从 PDF 提取 Title / Author / Conference / DOI / Abstract / Keywords；从 PDF 参考文献段提取**引用关系**（可选接入 GROBID 提高解析准确率）。
- **格式转换**：BibTeX / RIS / EndNote / JSON / Markdown 互转。
- **引用生成**：一键插入 BibTeX 记录，按 IEEE / ACM / APA / Nature / Springer 格式输出。
- **相似文献推荐**：基于摘要向量相似度 + 共引关系，推荐相关工作。
- **全文翻译（详见模块十）**：一键生成中文全文译文 `translation_zh.md`，翻译 API 初译 + AI 模型学术润色协同，公式与关键数据保留原文，术语对照表附末尾；提供双语对照阅读视图。

### 模块二：知识图谱中心（Knowledge Graph SubAgent）

类似 Obsidian，基于本地存储构建文献与笔记间的关联网络。

**功能清单：**

- **双链解析**：解析 Markdown/LaTeX 中的 `[[文献/概念]]` 语法，建立笔记 ↔ 文献 ↔ 代码文件的双向链接。
- **图谱存储**：节点（文献、笔记、概念、代码仓库）与边（引用、提及、实现、演进）存入本地图存储。
- **图谱可视化**：前端力导向图（Force-Directed Graph），展示技术演进路线、引用关系、研究热点。
- **Graph RAG 查询**：支持针对图谱簇的语义提问，如"找出所有关于注意力优化的文献及对应代码实现"。
- **自动建链**：AI 阅读论文后自动生成概念节点并挂载到图谱。

### 模块三：本地 LaTeX 编辑器

**功能清单：**

- **编辑器**：集成 Monaco Editor，支持 LaTeX 语法高亮、补全、BibTeX 语法检查。
- **编译与预览**：后台调用轻量编译引擎 **Tectonic**（Rust 实现、按需下载宏包，避免数 GB 的 TeX Live），生成 PDF 实时预览，支持 SyncTeX 正反向跳转。
- **格式校验**：`latex_format_check` 技能做编译错误定位与期刊模板合规检查。

### 模块四：实验数据分析中心（Data Analysis SubAgent）

**功能清单：**

- **Python 沙盒**：独立虚拟环境 / Jupyter Kernel 子进程执行，文件读写权限严格限定在项目工作区内，防止 Agent 脚本误操作系统文件。
- **数据处理**：封装 NumPy / Pandas / SciPy / scikit-learn，支持数据清洗、描述性统计、统计检验。
- **学术出图**：Matplotlib / Seaborn / Plotly 生成出版级图表（矢量 PDF/SVG、300+ DPI）。
- **实验关联**：生成的图表自动关联到对应代码 commit 与论文 LaTeX 章节。
- （扩展）实验设计：生成 Experiment Plan（假设 / 基线 / 数据集 / 指标 / 消融），集成 Optuna 做参数优化。

### 模块五：论文写作助手（Paper Writing SubAgent + Skill 池）

**功能清单：**

- **标题命名生成**：根据摘要与正文生成多版本候选标题。
- **论文结构建议**：按研究方向 / 目标会议生成标准骨架（Introduction → Related Work → Method → Experiment → Conclusion）。
- **学术润色**：学术语气重写、语法修正、被动语态转换。
- **代码插入与排版辅助**：实验代码自动提炼为伪代码（Algorithm2e），数据结果自动转为 LaTeX Table，Markdown 笔记转 LaTeX。
- **引用助手**：写作时自动推荐引用、生成 BibTeX、检查引用格式。

### 模块六：OpenCode 原生能力保留

- Coding Agent、Tool Calling、MCP 扩展能力
- GitHub 连接、Repo 级代码理解与搜索、自动修改代码
- 在此之上叠加**论文复现能力**：输入论文 + GitHub 地址 → Clone → 代码分析 → 环境检测 → 运行实验 → 结果比对（作为 Skill 编排实现，不改内核）

### 模块七：科研绘图中心（Plot SubAgent）

对标 GraphPad Prism（统计图表）、Origin（数据绘图）、Visio（流程/示意图）三类商业软件，全部基于开源方案实现。

**功能清单：**

- **出版级统计图表（类 Prism）**：模板化图表库——分组柱状图（误差棒 + 显著性标注 `*/**/***`）、散点回归、箱线/小提琴图、生存曲线、热图等；内置期刊风格主题（Nature / Science / IEEE 配色与字号规范）；与统计检验联动，p 值自动转为显著性星标。
- **数据绘图工作台（类 Origin）**：多图层/多子图画布，坐标轴、刻度、图例的可视化调参面板；参数面板与底层代码双向同步（调参即改代码，改代码即更新图），保证可复现。
- **流程图与示意图（类 Visio）**：嵌入开源 **draw.io（diagrams.net，Apache-2.0）** 编辑器，支持模型架构图、实验流程图、系统框图；提供科研常用图形库（神经网络层、数据集、Agent 组件等自定义 stencil）。
- **代码即图（Diagram-as-Code）**：集成 **Mermaid**（流程图/时序图/甘特图/类图/ER 图）、**Graphviz**（自动布局有向图）、**PlantUML**（UML）；源码存 Git 可 diff，AI 可直接生成/修改图源码并实时预览。
- **论文直通导出**：所有图表一键导出矢量 PDF/SVG（300+ DPI PNG），并可导出 **TikZ/PGFPlots** 源码直接嵌入 LaTeX；一键"插入论文 §X"自动生成 `\includegraphics` + caption + label。
- **AI 绘图助手**：自然语言描述 → 生成图表/示意图（如"画一个三智能体协作架构图"自动产出 Mermaid 或 drawio 文件）；对已有图表做风格统一（批量套用期刊主题）。

**与模块四的分工**：模块四（数据分析）负责"算"——数据清洗、统计、探索性出图；模块七负责"画"——面向出版的精修图表、示意图与流程图。两者共享 Python 沙盒与产物库。

### 模块八：Agent 资产管理中心（Asset Center）

Skill、MCP、SubAgent、Model、Command、Rules、Hook（Plugin）等 Agent 资产的**统一配置入口**。核心原则：**不重复造轮子——OpenCode 原生已有全部资产的定义机制、list API 和部分写入通道，本模块做的是"聚合 + 补缺 + 在对话页暴露使用方式"**。

**OpenCode 原生现状（已调研）与本模块的定位：**

| 资产 | 原生已有 | 原生缺失（本模块补） |
| --- | --- | --- |
| Model / Provider | 模型选择器、可见性管理（`DialogManageModels`）、settings-v2 的 providers/models 页、全局 config 写入（`PATCH /config`） | 统一入口聚合；科研场景推荐配置 |
| MCP | 状态/开关对话框（`dialog-select-mcp`）、status popover、OAuth、runtime `POST /mcp` add | **添加/编辑 server 的 UI**（endpoint 已有但无界面）、写入 config 持久化、常用 MCP 模板库 |
| Skill | `GET /api/skill` 列表、skill tool 调用、slash 菜单中 skill 徽标 | **Skills 管理页**（列表/新建/编辑 SKILL.md/启用）、科研 Skill 包一键安装 |
| SubAgent | composer agent 切换器、@-mention 子代理、`GET /api/agent` | Agent 编辑（frontmatter 表单 + markdown 编辑）、新建向导 |
| Command | slash 菜单（command/skill/mcp 三源合一）、`GET /api/command` | 命令管理列表与编辑 |
| Rules（AGENTS.md） | 自动加载注入 system context | **查看/编辑 UI**（原生完全无界面） |
| Hook / Plugin | plugin `config`/`event`/`tool.execute.*` hooks、status popover 只读插件列表 | 插件启用/禁用 UI、hook 触发点可视化说明 |

**功能清单：**

- **统一资产页**：左侧资产类型导航 + 右侧管理面板的设置中心式布局，每类资产一个面板。
- **Skill 管理**：卡片列表（名称/描述/来源目录/启用开关）；内置编辑器直接修改 `SKILL.md`；`researchos-preset` 科研 Skill 包（paper-reading、graph-rag、academic-polish 等）一键安装到课题 `.opencode/skill/`。
- **MCP 管理**：server 列表（连接状态、工具数、认证状态）；复用原生 connect/disconnect/OAuth 通道；新增"添加 server"表单（local command / remote url 两种模式）走 `PATCH /config` **持久化**到 `opencode.json`；预置 ResearchOS 七个模块的 MCP server 模板，一键接入。
- **Model 管理**：直接复用原生 `DialogManageModels` / settings-v2 providers/models 能力，聚合为本页一个面板。
- **Hook/Plugin 管理**：插件列表（来源、注册的 hooks 类型可视化——如 `tool.execute.before`），启用/禁用写 config `plugin` 数组。
- **Rules 管理**：课题 AGENTS.md 的查看器 + 编辑器（标注生效的加载链路：课题级 → 全局级）。
- **对话页使用方式（原生机制增强，不改交互范式）**：
  - slash 菜单：原生已把 skill/MCP prompt 合入命令列表（带来源徽标）——保持，ResearchOS 的 Skill 自动出现在其中；
  - `@` 提及：原生支持 @子代理、@MCP resource——增强为也支持 @Skill、@文献、@数据集（上下文芯片）；
  - 模型选择器：原生 composer 已有，入口保留，"管理"跳转到资产中心对应面板；
  - composer 新增"资产快捷条"：当前课题启用的 Skill/Agent 以 chip 展示，点击即插入 `/skill` 或 `@agent`。

**边界**：不实现 workflow 编排器与独立 prompt 库（首版超出必要范围；prompt 模板需求由 Command/Skill 机制覆盖）。

### 模块九：外部 API 统一管理中心（API Hub）

各模块的外部学术 API 调用收敛到统一注册中心——**薄 fetch 封装 + zod 校验，不引入任何厂商 SDK**，统一处理认证、限流、缓存与状态监控；UI 并入「资产管理中心」的 API 面板。

- **纳管范围**：arXiv API、Semantic Scholar Graph API、Crossref REST、NCBI E-utilities、GROBID（自部署）、GitHub REST、HuggingFace Hub、Tectonic bundle CDN；预留 OpenAlex / Unpaywall。LLM provider 与 models.dev 属 opencode 原生体系，Hub 只读展示不接管。
- **统一横切能力**：每 provider 令牌桶限流 + 指数退避、SQLite 响应缓存（TTL 可配）、API key 集中配置（`{env:VAR}` 引用，不落明文）、健康探测与调用统计。
- **形态**：纯 TS 库包 `@researchos/api-hub`（不做 MCP server），被 literature/graph/reproduce 等包内部依赖；配置写 `opencode.json` 的 `researchos.api.*`（走 `asset.config_patch`）。
- 详细落地见 `docs/modules/09-api-hub.md`（含全量 API 盘点表：用途、认证、限流、条款）。

### 模块十：全文翻译中心（Translation SubAgent）

为文献中心提供学术级全文翻译，采用**"格式转换 → 翻译 API 初译 → AI 模型润色"三级协同管线**，成本与质量兼得。

**功能清单：**

- **PDF 全文提取与结构化**：PyMuPDF 按块提取全文文本（`page.get_text()`），分类为标题/段落/公式/表格/图注，重建 Markdown 骨架（格式转换为 MD）。
- **协同翻译**：
  - 第一级 **翻译 API 初译**（LibreTranslate 自托管免费 / DeepL Free 每月 50 万字符）——快速、低成本覆盖全文；
  - 第二级 **AI 模型润色**（走 opencode 原生 LLM provider，不引入新计费）——学术语气、术语一致性、长句重组，并修复初译的公式上下文错乱；
  - 摘要、引言、相关工作、方法、实验、结论分节处理，支持只译指定章节。
- **原文保真规则**：数学公式（`$...$`/`\[...\]`/公式块）、关键实验数据、图表引用（Fig. 3 / Table 2）、算法伪代码**保留原文不译**；译文中以原文+中文注释并置。
- **术语对照表**：LLM 从译文抽取领域术语生成中英对照表附于文末；课题级术语库累积复用，保证同一课题内译法一致。
- **双语对照阅读**：文献详情页一键切换"原文 / 译文 / 双语对照"（段落级对齐）；译文反向链接知识图谱（译文中的 `[[概念]]` 同样建链）。
- **输出**：`translation_zh.md` 存课题 `.researchos/translations/<paper_id>/`，纳入 Git 管理。

---

## 四、技术选型

| 层次 | 选型 | 理由 |
| --- | --- | --- |
| Agent 底座 | OpenCode（CLI / Web / Desktop） | 成熟开源，多端齐全，MCP 原生支持 |
| 工具协议 | MCP（Model Context Protocol） | OpenCode 原生支持，Skill 标准化封装 |
| 文献库 | SQLite + 本地 PDF 目录（兼容 Zotero DB 导入） | 本地优先，零外部依赖 |
| 文献 API | arXiv / Semantic Scholar / Crossref / PubMed | 免费、覆盖广 |
| 引用关系提取 | 规则解析 + 可选 GROBID | GROBID 是 PDF 参考文献解析事实标准，可选部署 |
| 向量检索 | 本地嵌入模型 + SQLite 向量扩展（sqlite-vec） | 轻量、本地、与文献库同库 |
| 图谱存储 | SQLite 边表（起步）→ Kuzu（扩展） | 起步简单，图查询复杂时升级嵌入式图库 |
| 图谱可视化 | 前端力导向图（D3-force / Sigma.js） | 与 OpenCode Web UI 技术栈兼容 |
| LaTeX 编译 | **Tectonic** + SyncTeX | 跨平台、按需下载宏包，避免 TeX Live 数 GB 体积 |
| LaTeX 编辑器 | Monaco Editor | OpenCode 前端同源技术 |
| 数据分析 | 独立 Python venv / Jupyter Kernel：NumPy、Pandas、SciPy、scikit-learn、Matplotlib、Seaborn、Plotly | 科研标准生态；沙盒隔离保安全 |
| 科研统计图表 | Plotly / Vega-Lite / Matplotlib + 自研模板库（Prism 风格主题与显著性标注） | 开源、可脚本化、出版级矢量输出 |
| 示意图编辑 | draw.io（diagrams.net，Apache-2.0）嵌入 + Excalidraw（手绘风备选） | 最成熟的开源 Visio 替代，文件格式开放 |
| 代码即图 | Mermaid.js + Graphviz + PlantUML | 文本化、Git 友好、AI 可直接生成 |
| 图表-LaTeX 桥接 | TikZ / PGFPlots 导出 | 矢量无损嵌入论文，字体风格统一 |
| Skill 实现语言 | TypeScript（轻量 API 类）+ Python（文献解析 / 数据分析 / 绘图类） | 各取所长 |

---

## 五、各模块接口定义

所有 Skill 以 MCP Tool 形式暴露，SubAgent 通过 OpenCode 的 Agent 配置声明可调用的 Skill 集合。以下为接口契约（入参/出参用 JSON Schema 描述）。

### 5.1 文献管理 Skill 组

```
literature.search
  入参: { query: string, sources?: ["arxiv","semantic_scholar","crossref","pubmed"], limit?: number }
  出参: { papers: PaperMeta[] }

literature.import_pdf
  入参: { path: string } 或 { url: string }
  出参: { paper_id: string, meta: PaperMeta }

literature.get_metadata
  入参: { paper_id: string } 或 { doi: string }
  出参: PaperMeta  // { title, authors[], year, venue, doi, abstract, keywords[], pdf_path }

literature.get_citations
  入参: { paper_id: string, direction: "references" | "cited_by" }
  出参: { edges: [{ from_id, to_id, context? }] }

literature.recommend_similar
  入参: { paper_id: string, limit?: number }
  出参: { papers: (PaperMeta & { score: number })[] }

literature.export
  入参: { paper_ids: string[], format: "bibtex" | "ris" | "endnote" | "json" | "markdown",
          style?: "ieee" | "acm" | "apa" | "nature" | "springer" }
  出参: { content: string }
```

### 5.2 知识图谱 Skill 组

```
graph.parse_wikilinks
  入参: { paths: string[] }          // Markdown/LaTeX 文件
  出参: { nodes: GraphNode[], edges: GraphEdge[] }

graph.upsert
  入参: { nodes: GraphNode[], edges: GraphEdge[] }
  出参: { ok: true }
  // GraphNode: { id, type: "paper"|"note"|"concept"|"repo", label, ref_id? }
  // GraphEdge: { from, to, relation: "cites"|"mentions"|"implements"|"evolves" }

graph.query
  入参: { question: string, scope?: { center_node?: string, depth?: number } }
  出参: { subgraph: { nodes, edges }, answer: string }   // Graph RAG

graph.layout
  入参: { filter?: { type?: string } }
  出参: { nodes: [{ id, label, x, y }], edges: [...] }   // 供前端可视化
```

### 5.3 LaTeX Skill 组

```
latex.compile
  入参: { main_file: string, engine?: "tectonic" }
  出参: { ok: boolean, pdf_path?: string, log: string, errors: LatexError[] }
  // LatexError: { file, line, message }

latex.synctex
  入参: { pdf_path: string, page: number, x: number, y: number }  // 反向
       或 { file: string, line: number }                          // 正向
  出参: { file: string, line: number } 或 { page, x, y }

latex.format_check
  入参: { main_file: string, template?: string }   // 如 "ieee", "acm"
  出参: { issues: [{ file, line, rule, message }] }
```

### 5.4 数据分析 Skill 组

```
data.run_python
  入参: { code: string, workdir: string, timeout_s?: number }
  出参: { stdout: string, stderr: string, artifacts: string[] }  // 沙盒内执行

data.profile
  入参: { file: string }              // csv/parquet 等
  出参: { schema: [...], stats: {...}, anomalies: [...] }

data.stat_test
  入参: { file: string, test: "ttest"|"anova"|"chi2"|..., columns: string[], params?: {} }
  出参: { statistic: number, p_value: number, conclusion: string }

data.chart
  入参: { file: string, kind: "line"|"bar"|"scatter"|"heatmap"|..., spec: {...},
          format: "pdf"|"svg"|"png", dpi?: number }
  出参: { artifact_path: string, latex_snippet?: string }

data.link_experiment
  入参: { artifact_path: string, commit?: string, tex_section?: string }
  出参: { ok: true }                  // 图表 ↔ commit ↔ 论文章节 关联入库
```

### 5.5 论文写作 Skill 组

```
writing.suggest_titles
  入参: { abstract: string, keywords?: string[], count?: number }
  出参: { titles: string[] }

writing.suggest_structure
  入参: { topic: string, venue?: string }
  出参: { sections: [{ name, outline: string[] }] }   // 可生成 paper.tex 骨架

writing.rewrite
  入参: { text: string, style: "academic"|"concise"|"passive" }
  出参: { text: string }

writing.code_to_algorithm
  入参: { file: string, function?: string, package?: "algorithm2e"|"algorithmicx" }
  出参: { latex: string }

writing.table_to_latex
  入参: { file: string, caption?: string, label?: string, style?: "booktabs" }
  出参: { latex: string }

writing.md_to_latex
  入参: { file: string }
  出参: { latex: string }

writing.cite_assist
  入参: { context: string }            // 当前段落
  出参: { suggestions: (PaperMeta & { bibtex: string })[] }
```

### 5.6 科研绘图 Skill 组

```
plot.chart_create
  入参: { template: "grouped_bar"|"scatter_regression"|"boxplot"|"violin"|"survival"|"heatmap"|...,
          data: { file: string } | { inline: [...] },
          theme?: "nature"|"science"|"ieee"|"prism", spec?: {...} }
  出参: { chart_id: string, artifact_path: string, preview_svg: string }

plot.chart_tune
  入参: { chart_id: string, patch: {...} }   // 坐标轴/刻度/图例/配色 增量调参，双向同步底层代码
  出参: { artifact_path: string, code: string }

plot.annotate_significance
  入参: { chart_id: string, test: "ttest"|"anova"|..., groups: string[] }  // p 值 → */**/*** 自动标注
  出参: { artifact_path: string, p_values: [...] }

plot.diagram_edit
  入参: { action: "create"|"open", file?: string, stencil_pack?: "nn_layers"|"agent"|"flow" }
  出参: { file: string }                      // drawio 文件，前端嵌入 draw.io 编辑器

plot.mermaid_render
  入参: { code: string, theme?: string }      // flowchart/sequence/gantt/class/er
  出参: { svg: string, artifact_path: string, errors?: [...] }

plot.graphviz_render
  入参: { dot: string, engine?: "dot"|"neato"|"fdp" }
  出参: { svg: string, artifact_path: string }

plot.generate_diagram
  入参: { description: string, kind: "mermaid"|"drawio"|"graphviz" }   // AI 自然语言生成图
  出参: { file: string, preview_svg: string }

plot.export
  入参: { artifact_path: string, format: "pdf"|"svg"|"png"|"tikz", dpi?: number }
  出参: { export_path: string }

plot.insert_to_paper
  入参: { artifact_path: string, tex_file: string, section?: string, caption: string, label?: string }
  出参: { ok: true, latex_snippet: string }   // \includegraphics + caption + label
```

### 5.7 OpenCode 原生能力（复用 + 编排层）

```
复用: coding agent / repo 理解 / GitHub 连接 / MCP —— 不新增接口
新增编排 Skill:
reproduce.paper
  入参: { paper_url: string, repo_url: string }
  出参: { env_report, run_log, result_comparison }   // 内部编排原生 coding 能力
```

### 5.8 Agent 资产管理 Skill / API 组

原则：读路径全部复用原生 list API，写路径优先复用原生 config 写入通道；只有"文件类资产落盘"需要新增一个 endpoint。

```
# 读（复用原生，不新增）：
GET /api/skill · GET /api/agent · GET /api/command · GET /api/model · GET /api/provider
legacy: GET /mcp（状态）· GET /config

# 写（复用原生通道）：
asset.config_patch          → PATCH /config（项目级）/ 全局 config 更新
  入参: { scope: "project"|"global", patch: {...} }       // mcp 增删、plugin 启停、model 默认
asset.mcp_add               → legacy POST /mcp（runtime add）+ PATCH /config（持久化）
  入参: { name, type: "local"|"remote", command?: string[], url?: string, env?, enabled }
asset.mcp_toggle / auth     → legacy POST /mcp/:name/connect|disconnect|auth（原生 OAuth 流程）
asset.model_visibility      → 复用原生 local.model.setVisibility（client-local）

# 写（新增，文件类资产落盘 —— 新增 protocol group researchos-assets + server handler）：
asset.file_write
  入参: { kind: "skill"|"agent"|"command"|"rules", name: string, content: string,
          scope: "project"|"global" }
  出参: { path: string }    // 写入 .opencode/skill/<name>/SKILL.md、.opencode/agent/<name>.md、
                            // .opencode/command/<name>.md、AGENTS.md；写完触发 config 热重载
asset.preset_install
  入参: { pack: "researchos-skills"|"researchos-agents"|"researchos-mcp", target: "project"|"global" }
  出参: { installed: string[] }   // 从 researchos-preset 拷贝到 .opencode/ 对应目录

# Agent 侧辅助 tool（plugin tool，供 SubAgent 自检环境）：
asset.list_enabled
  出参: { skills, agents, mcp_servers, models }   // 当前生效资产快照

# 外部 API 管理（researchos-assets group 只读 endpoint，server handler 内调 @researchos/api-hub）：
api.list
  出参: { apis: [{ name, purpose, status: "healthy"|"throttled"|"failed"|"disabled",
                   rate_limit, monthly_calls, cache_hit_rate, managed: "hub"|"native" }] }
api.test
  入参: { name: string }
  出参: { ok: boolean, latency_ms: number, error?: string }
api.config                        // 写 researchos.api.* → 走 asset.config_patch 通道
  入参: { name: string, key?: string, url?: string, mailto?: string, enabled?: boolean }
api.cache_clear
  入参: { name?: string }          // 缺省清空全部
  出参: { cleared: number }
```

### 5.9 全文翻译 Skill / API 组

```
translate.paper
  入参: { paper_id: string, target_lang?: "zh", sections?: string[],
          engine?: "auto" | "api" | "llm" }   // auto = API 初译 + LLM 润色
  出参: { job_id: string, md_path: string }    // .researchos/translations/<paper_id>/translation_zh.md

translate.status
  入参: { job_id: string }
  出参: { state: "extracting"|"translating"|"polishing"|"done"|"failed",
          progress: number, current_section?: string, error?: string }

translate.glossary
  入参: { paper_id: string }
  出参: { terms: [{ en: string, zh: string, source: "auto"|"manual" }] }

translate.glossary_update
  入参: { paper_id: string, terms: [{ en, zh }] }   // 人工修正术语，写回课题术语库
  出参: { ok: true }

translate.export_bilingual
  入参: { paper_id: string, format: "md" | "html" }
  出参: { path: string }          // 段落级原文/译文对照文档
```

---

## 六、开发优先级与路线图

遵循"先底座、再数据、后 UI、终闭环"，并保证每个阶段都有可演示成果：

| 阶段 | 内容 | 依赖 | 可演示成果 |
| --- | --- | --- | --- |
| **P0 底座** | Skill/MCP 插件化规范、SubAgent 路由机制、本地科研知识底座（SQLite + Vault 目录结构）、**Agent 资产管理中心**（资产聚合页 + config 写入通道 + 文件类资产落盘 endpoint） | 无 | 一个自定义 Skill 能在 OpenCode 中跑通，并能在资产中心看到/管理它 |
| **P1 文献中心** | 文献搜索、PDF 导入、元数据提取、BibTeX 导出、本地文献库 | P0 | "搜 20 篇论文并生成文献库 + BibTeX" |
| **P2 知识图谱** | 双链解析、图谱存储、可视化面板、Graph RAG 查询 | P1（文献即节点） | 文献 ↔ 笔记关联图谱可视化 |
| **P3 LaTeX + 写作** | Monaco 编辑器集成、Tectonic 编译预览、写作 Skill 池（标题/结构/润色/排版/引用） | P0；引用助手依赖 P1 | 在线写 LaTeX、实时预览、一键插引用 |
| **P4 数据分析 + 科研绘图** | Python 沙盒、数据处理、统计图表模板库、Mermaid/Graphviz 渲染、draw.io 嵌入、出版级导出 | P0 | 上传 CSV → 自动分析 → 出版级 Figure；一句话生成架构示意图 |
| **P5 闭环编排** | 全流程 Workflow 编排 + 端到端测试：文献检索 → 知识图谱 → 实验/数据分析 → 绘图 → 论文撰写编译 | P1–P4 | 完整 Demo：一个研究课题从检索到论文初稿 |

**MVP 建议（黑客松/首版）**：P0 + P1 + P2 + P3 的写作 Skill 部分 + P5 精简闭环——即"输入研究主题 → 自动检索建库 → 生成图谱 → 生成 LaTeX 初稿"这条最亮眼的链路；P4 可先用 `data.run_python` + `data.chart` 两个 Skill 顶上。

---

## 七、关键风险与规避策略

1. **LaTeX 依赖过重**：弃用 TeX Live，采用 Tectonic（按需下载宏包，跨平台单二进制）。
2. **数据沙盒安全**：Python 在独立 venv / 子进程中执行，文件读写限定工作区，禁止网络出站白名单外请求，设置超时与资源上限。
3. **上游同步成本**：核心零侵入，全部以 Plugin / MCP Server / Skill 包外挂；Fork 内改动集中于 UI 新增面板与 SubAgent 注册配置。
4. **PDF 解析质量**：元数据优先走 DOI → Crossref/Semantic Scholar API 补全，PDF 正文解析（GROBID）作为可选增强，不阻塞主链路。
5. **范围蔓延**：严格按 P0–P5 推进，每个 Skill 接口先行定义、冻结后再实现，避免 Agent 能力边界模糊。

---

## 八、一句话总结

> **ResearchOS = OpenCode 的 Coding Agent 底座 + 科研全链路的 Skill/SubAgent 生态**：以 MCP 协议外挂文献管理、知识图谱、LaTeX 写作、数据分析、科研绘图五大能力，保留原生编码与 GitHub 优势，最终打通"检索 → 关联 → 实验 → 绘图 → 成文"的科研闭环。
