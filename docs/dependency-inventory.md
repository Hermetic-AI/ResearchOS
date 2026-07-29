# ResearchOS 依赖清单

> **本文是 ResearchOS 项目的完整依赖、引用与外部能力清单。**
> 新增任何依赖前必须在此更新。按层级分类：运行时 npm 包、Python 包、外部 API、开源工具/二进制、MCP 实现、Skill 引用源、数据库/中间件、OpenCode 原生依赖。

---

## 一、项目运行时依赖（bun/npm — `packages/researchos-*`）

### 1.1 文献管理（`@researchos/literature`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `bun:sqlite` | SQLite 驱动（Bun 内置） | 内置 | — |
| `sqlite-vec` | 向量检索虚拟表（`vec0`） | MIT | 0.1.9 |
| `@huggingface/transformers`（transformers.js，`@xenova/transformers` 的同项目新名） | 本地嵌入推理（`bge-small-en-v1.5` ONNX） | Apache-2.0 | 4.2.0 |
| `pdfjs-dist` | PDF 文本提取 | Apache-2.0 | 6.1.200 |
| `@citation-js/core` | 核心引用格式引擎 | MIT | 0.8.2 |
| `@citation-js/plugin-csl` | CSL 样式渲染 | MIT | 0.8.2 |
| `@citation-js/plugin-bibtex` | BibTeX 解析 | MIT | 0.8.2 |
| `@citation-js/plugin-ris` | RIS 解析 | MIT | 0.8.2 |
| `@modelcontextprotocol/sdk` | MCP stdio server 传输 | MIT | repo 已有 |
| `zod` | 参数校验 | MIT | repo 已有 |

### 1.2 知识图谱（`@researchos/graph`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `bun:sqlite` | 边表存储 + FTS5 | 内置 | — |
| `sqlite-vec` | 向量检索 | MIT | 0.1.9 |
| `mdast-util-from-markdown`（unified 生态，remark-parse 底层） | Markdown `[[...]]` AST 解析 | MIT | 2.0.3 |
| `d3-force` | 力导向图布局算法（SVG 渲染） | ISC | 3.0.0 |
| `d3-zoom`（含 `d3-selection` 3.0.0） | 图谱缩放拖拽 | ISC | 3.0.0 |
| `@huggingface/transformers`（transformers.js） | 本地嵌入（bge-small-en-v1.5，与文献库统一） | Apache-2.0 | 4.2.0 |
| `@modelcontextprotocol/sdk` | MCP stdio server | MIT | 1.29.0 |
| Sigma.js + graphology + forceatlas2 | WebGL 大规模图谱（扩展路径） | MIT | 后续引入 |
| Kuzu | 嵌入式图库（扩展路径，SQLite→Kuzu 升级） | MIT | 后续引入 |
| `zod` | 参数校验 | MIT | repo 已有 |

### 1.3 LaTeX 编辑器（`@researchos/latex`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `monaco-editor` | 编辑器内核、Monarch 高亮与 cite key 补全（app 直接依赖） | MIT | 0.52.2 |
| `pdfjs-dist` | PDF 渲染 + SyncTeX 反向跳转（app 直接依赖） | Apache-2.0 | 6.1.200 |
| `@modelcontextprotocol/sdk` | MCP stdio server | MIT | 1.29.0 |

> 自研模块：Monarch tokenizer（LaTeX 语法高亮）、SyncTeX parser（`.synctex.gz` 解析）、BibTeX 轻量 parser、Tectonic 日志解析——无额外 npm 依赖。

### 1.4 数据分析（`@researchos/data`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `bun:sqlite` | 产物库 SQLite | 内置 | — |
| ~~better-sqlite3~~ → 实际用 `bun:sqlite`（与 literature/graph 统一） | TS 侧 DB 访问 | MIT | 内置 |
| `zod` | 参数校验 | MIT | repo 已有 |

> 核心计算在 Python 侧（§二）。

### 1.5 论文写作（`@researchos/writing` — plugin）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `papaparse` | CSV 解析 | MIT | 5.5.4 |
| `markdown-it` | Markdown→LaTeX token 流转换 | MIT | 14.3.0 |
| `diff`（jsdiff） | 词级 diff（润色 review 视图） | BSD-3-Clause | 9.0.0 |

### 1.6 代码复现（`@researchos/reproduce`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `bun:sqlite` | 复现记录存储 | 内置 | — |
| `@modelcontextprotocol/sdk` | MCP stdio server | MIT | repo 已有 |
| `zod` | 参数校验 | MIT | repo 已有 |

> Git clone 复用 OpenCode 原生能力；依赖解析自研（正则 + TOML/YAML）。

### 1.7 科研绘图（`@researchos/plot-core` — plugin）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `mermaid`（npm） | Mermaid 前端 SVG 渲染 + 服务端 parse 校验 | MIT | 11.12.0 |
| `@hpcc-js/wasm` | Graphviz WASM 移植（DOT → SVG） | Apache-2.0 | 2.30.0 |

> PlantUML 列为可选扩展（依赖 Java/服务器，首版不引入）。
> draw.io（diagrams.net）以 iframe + postMessage 嵌入，不引入为 npm 依赖。
> 统计图渲染在 Python 侧（§二）。

### 1.8 API Hub（`@researchos/api-hub`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `zod` | 每 adapter 声明 response schema | MIT | repo 已有 |

> 所有外部 HTTP 调用用原生 `fetch` + 自写 retry/timeout，不引入任何 API 厂商 SDK。

### 1.9 全文翻译（`@researchos/translate`）

| 包名 | 用途 | License | 引入版本 |
|---|---|---|---|
| `bun:sqlite` | 翻译任务/术语/段落对齐存储 | 内置 | — |
| `zod` | 参数校验 | MIT | repo 已有 |

> PDF 提取在 Python 侧（§二，PyMuPDF）。

### 1.10 Preset（`@researchos/preset`）

无运行时 npm 依赖。本包是纯 markdown 资产包（agent/skill/command）。

---

## 二、Python 依赖（`packages/researchos-mcp/*`，uv 管理）

### 2.1 literature MCP server

| 包名 | 用途 | License |
|---|---|---|
| `mcp`（FastMCP） | MCP server 框架 | MIT | 1.29.0（pin <2） |
| `pymupdf` | PDF 文本提取（备选，主解析在 TS 侧 pdfjs） | AGPL-3.0 |
| `requests` / `httpx` | API fetch | Apache-2.0 / BSD |

### 2.2 data MCP server

| 包名 | 用途 | License |
|---|---|---|
| `mcp`（FastMCP） | MCP server 框架 | MIT | 1.29.0（pin <2） |
| `numpy` | 数值计算 | BSD-3 | 2.5.1 |
| `pandas` | 数据处理 | BSD-3 | 3.0.5 |
| `scipy` | 统计检验（`scipy.stats`） | BSD-3 | 1.18.0 |
| `scikit-learn` | 机器学习（扩展） | BSD-3 |
| `matplotlib` | 学术出图（矢量 PDF/SVG） | PSF | 3.11.1 |
| `seaborn` | 统计可视化 | BSD-3 | 0.13.2 |
| `plotly` + `kaleido` | 交互预览 + 静态导出 | MIT |
| `pyarrow` | Parquet 读写 | Apache-2.0 | 25.0.0 |
| `optuna` | 参数优化（扩展，v2） | MIT |
| `jupyter_client` | Jupyter Kernel 模式（扩展，v2） | BSD-3 |

### 2.3 plot MCP server

| 包名 | 用途 | License |
|---|---|---|
| `mcp`（FastMCP） | MCP server 框架 | MIT | 1.29.0（pin <2） |
| `matplotlib` | 出版级图表渲染 | PSF | 3.11.1 |
| `seaborn` | 统计可视化 | BSD-3 | 0.13.2 |
| `scipy` | 显著性检验（`ttest_ind` / `f_oneway` / `mannwhitneyu`） | BSD-3 | 1.18.0 |

### 2.4 translate MCP server

| 包名 | 用途 | License |
|---|---|---|
| `mcp`（FastMCP） | MCP server 框架 | MIT | 1.29.0（pin <2） |
| `pymupdf`（`fitz`） | PDF 块级全文提取（`doc[i].get_text("dict")`） | AGPL-3.0 |

---

## 三、外部 API（经 API Hub 纳管）

### 3.1 学术文献 API（模块一）

| API | 用途 | 认证 | 限流 | 条款 |
|---|---|---|---|---|
| **arXiv API** | 文献搜索 | 无 | 建议 ≥3s 间隔 | 免费，要求合理频率 |
| **Semantic Scholar Graph API** | 搜索/引用关系/相似推荐 | 可选 API key | 无 key ~100 req/5min；有 key 更高 | 免费学术使用 |
| **Crossref REST API** | DOI 元数据补全、CSL/BibTeX | 无（mailto 进 polite pool） | 免费；polite pool | 免费，建议带 mailto |
| **NCBI E-utilities**（PubMed） | 医学文献搜索 | 可选 API key | 无 key 3 req/s；有 key 10 req/s | 免费，需遵守 usage guidelines |

### 3.2 其他学术/工具 API

| API | 用途（消费模块） | 认证 | 条款 |
|---|---|---|---|
| **GROBID**（自部署 Docker） | PDF 参考文献深度解析（模块一，可选） | 无（自托管） | Apache-2.0 |
| **GitHub REST API** | 复现 repo 元数据（模块六） | token（复用 opencode credential） | GitHub API Terms |
| **HuggingFace Hub** | transformers.js 模型下载（模块二） | 可选 token | 模型各自 license |
| **Tectonic bundle CDN** | LaTeX 宏包按需下载（模块三） | 无 | 包内宏包各自 license |
| **LibreTranslate**（自托管 Docker） | 全文翻译初译（模块十，首选） | 无（自托管） | AGPL-3.0 |
| **DeepL API Free** | 全文翻译初译备选（模块十） | API key | 50 万字符/月免费 |

### 3.3 预留 API（后续迭代）

| API | 用途 | 认证 | 条款 |
|---|---|---|---|
| **OpenAlex** | OA PDF 查找、元数据增强 | 无 / mailto | 免费学术使用 |
| **Unpaywall** | OA PDF 查找 | 无 / mailto | 免费学术使用 |

### 3.4 平台级 API（OpenCode 原生管理，Hub 只读展示）

| API | 用途 |
|---|---|
| **LLM Providers**（Anthropic / OpenAI / Google / Ollama 等） | Agent 推理 |
| **models.dev catalog** | 模型目录 |

> 这些不由 API Hub 接管计费与配置，避免两套体系打架。

---

## 四、开源工具 / 二进制

| 工具 | 用途（消费模块） | License | 部署方式 |
|---|---|---|---|
| **Tectonic** | LaTeX 编译引擎（模块三） | MIT | 单二进制；Desktop 打包分发；server 侧安装 |
| **Docker Engine** | 复现环境隔离（模块六，首选） | Apache-2.0 | 用户本机已有；ResearchOS 不捆绑 |
| **draw.io（diagrams.net）** | Visio 类示意图编辑器（模块七） | Apache-2.0 | iframe 嵌入（web）；Electron webview 嵌入（Desktop） |
| **Graphviz** | DOT → SVG（模块七） | EPL-1.0 | `@hpcc-js/wasm`（WASM 移植，免安装 binary）；Desktop 可选打包 native |
| **PlantUML** | UML/时序图（模块七，可选扩展） | GPL-3.0 | `plantuml.jar` / 远程 server；首版不做 |
| **GROBID** | PDF 参考文献深度解析 | Apache-2.0 | Docker 自部署（模块一可选增强） |
| **LibreTranslate** | 全文翻译引擎（模块十） | AGPL-3.0 | Docker 自部署 |
| **Python**（≥3.10） | 沙盒运行时（模块四/七/十） | PSF | 用户本机；Desktop 首次引导安装 |

---

## 五、MCP 实现（ResearchOS 自研）

| MCP Server | 实现语言 | 暴露工具 | 部署 |
|---|---|---|---|
| `researchos-literature` | Python（FastMCP，uv） | `literature_search` / `literature_import_pdf` / `literature_metadata` / `literature_get_citations` / `literature_recommend_similar` / `literature_export` | `opencode.json` local command |
| `researchos-graph` | TypeScript（stdio，bun） | `graph.parse_wikilinks` / `graph.upsert` / `graph.query` / `graph.layout` | `opencode.json` local command |
| `researchos-latex` | TypeScript（stdio，bun） | `latex.compile` / `latex.synctex` / `latex.format_check` | `opencode.json` local command |
| `researchos-data` | Python（FastMCP，uv） | `data.run_python` / `data.profile` / `data.stat_test` / `data.chart` / `data.link_experiment` | `opencode.json` local command |
| `researchos-plot` | Python（FastMCP，uv） | `plot.chart_create` / `plot.chart_tune` / `plot.annotate_significance` | `opencode.json` local command |

---

## 六、SubAgent 清单（preset）

| Agent 文件 | 对应模块 | 角色 |
|---|---|---|
| `researchos-preset/agent/literature.md` | 模块一 | Literature SubAgent |
| `researchos-preset/agent/graph.md` | 模块二 | Knowledge Graph SubAgent |
| `researchos-preset/agent/paper-writer.md` | 模块五 | Paper Writing SubAgent |
| `researchos-preset/agent/data-analyst.md` | 模块四 | Data Analysis SubAgent |
| `researchos-preset/agent/plot.md` | 模块七 | Plot SubAgent |
| `researchos-preset/agent/reproduce-doctor.md` | 模块六 | Code Reproduce SubAgent |
| `researchos-preset/agent/translator.md` | 模块十 | Translation SubAgent |

---

## 七、Skill 清单（preset）

| Skill 目录 | 对应模块 | 用途 |
|---|---|---|
| `researchos-preset/skill/paper-reading/` | 模块一 | 论文阅读方法论（AI 阅读笔记生成） |
| `researchos-preset/skill/graph-rag/` | 模块二 | Graph RAG 检索技术 |
| `researchos-preset/skill/latex-troubleshoot/` | 模块三 | LaTeX 编译错误诊断 |
| `researchos-preset/skill/academic-polish/` | 模块五 | 学术润色方法论 |
| `researchos-preset/skill/algo2e/` | 模块五 | 代码→Algorithm2e 伪代码 |
| `researchos-preset/skill/scientific-plot/` | 模块七 | 科研绘图规范 |
| `researchos-preset/skill/reproduce-paper/` | 模块六 | 论文复现流水线 |

---

## 八、数据库与存储

| 组件 | 类型 | 文件路径约定 | 消费模块 |
|---|---|---|---|
| SQLite（bun:sqlite） | 文献库 | `{project}/.researchos/literature.db` | 模块一 |
| SQLite（bun:sqlite） | 图谱边表 | `{project}/.researchos/graph/graph.db` | 模块二 |
| SQLite（bun:sqlite） | 产物关联库 | `{project}/.researchos/data.db` | 模块四 |
| SQLite（bun:sqlite） | 复现记录库 | `{project}/.researchos/reproduce.db` | 模块六 |
| SQLite（bun:sqlite） | 翻译任务/术语库 | `{project}/.researchos/translate.db`（或复用 literature.db） | 模块十 |
| `sqlite-vec`（扩展） | 向量虚拟表 | 嵌入 literature.db / graph.db，同文件 | 模块一、二 |
| SQLite FTS5（内置） | 全文索引 | 同库内建，无需独立管理 | 模块二 |
| PDF 归档目录 | 文件系统 | `{project}/.researchos/papers/` | 模块一 |
| 实验产物 | 文件系统 | `{project}/.researchos/artifacts/` | 模块四、七 |
| 翻译产物 | 文件系统 | `{project}/.researchos/translations/{paper_id}/` | 模块十 |
| Python 虚拟环境 | 文件系统 | `{project}/.researchos/venv/` | 模块四、七、十 |
| Kuzu（扩展路径） | 图数据库 | 替换 graph.db（预留接口） | 模块二（后续） |

---

## 九、OpenCode 原生依赖（上游已引入，ResearchOS 复用）

| 组件 | 用途 | 说明 |
|---|---|---|
| `@opencode-ai/ui` | 设计系统（组件/主题令牌/字体/图标） | 前端只消费，不修改；新图标以本地组件形式补充 |
| `@opencode-ai/session-ui` | 会话/聊天渲染（markdown/diff/prompt input） | 复用 review/diff 交互 |
| `@modelcontextprotocol/sdk` | MCP 协议 | repo 已有依赖 + patch |
| `zod` | 参数校验 | repo 统一 |
| `SolidJS` | 前端框架 | `packages/app` 技术栈 |
| `Tailwind CSS` | 样式 | 只允许用主题令牌类名，不写裸十六进制色值 |
| `Vite` | 前端构建 | `packages/app` |
| `Bun` | 运行时/包管理/测试 | 仓库统一工具链 |
| `Effect`（effect-smol） | 函数式 effect 系统 | `packages/core` 使用 |
| `Drizzle ORM` | 数据库 ORM | 上游使用 |
| `Monaco Editor` | 代码编辑器 | `packages/app` 已有依赖 |
| `Electron` | Desktop 壳 | `packages/desktop` |
| `electron-builder` | Desktop 打包 | `packages/desktop` |
| `husky` | Git hooks | 仓库已有 |

---

## 十、开源 Skill 参考源（用于内置化研究，非运行时依赖）

| 来源目录 | 主题 | 已吸收 Skill |
|---|---|---|
| `docs/skills/academic-research-skills/` | 学术写作/研究流水线 | `academic-pipeline`、`academic-paper`、`academic-paper-reviewer`、`deep-research` |
| `docs/skills/research-hub/` | Zotero-AI 增强 | `research-hub`、`literature-triage-matrix`、`gap-to-topic`、`paper-summarize`、`paper-memory-builder` |
| `docs/skills/nature-skills/` | Nature 期刊向（中文） | `nature-academic-search`、`nature-polishing`、`nature-paper2ppt`、`nature-ref-verifier`、`nature-experiment-log` |
| `docs/skills/AI-Research-SKILLs/` | AI/ML 训练工具栈 | `autoresearch`（两环路自主研究） |
| `docs/skills/PaperSpine/` | 论文端到端骨架 | `paper-spine` |
| `docs/skills/paper-craft-skills/` | 论文可视化 | `paper-analyzer`、`paper-deck`、`paper-comic` |
| `docs/skills/Auto-Empirical-Research-Skills/` | 实证研究全流程 | 9 阶段模板 |
| `docs/skills/scientific-agent-skills/` | 科研计算工具包 | `scientific-visualization`、`scientific-slides`、`scientific-schematics`、`statistical-analysis` 等 |

> 详见 `docs/skills/researchos-skill-复用方案.md` 第七章"建议内置化"完整清单。

---

## 十一、禁止引入的依赖（明确排除）

| 排除项 | 原因 |
|---|---|
| Zotero 官方 API / SDK | 只做本地 SQLite DB 导入，薄 fetch 即可 |
| TeX Live / MiKTeX | 体积过大（数 GB），Tectonic 已覆盖 |
| Pandoc（二进制） | markdown-it 轻量替代 |
| 任何 API 厂商 SDK（arXiv.js、semanticscholar 等） | 薄 fetch + zod 即可，条款更友好 |
| googletrans / deepl-python 等翻译 SDK | 同上，经 API Hub adapter |
| isomorphic-git | 复用 OpenCode 原生 GitHub + shell `git clone` |
| 第三方 LaTeX 语言包 | 自研 Monarch tokenizer |
| `tikzplotlib` | 已停维，改用 Matplotlib pgf backend + 自研 |
| 新增 `patches/` 补丁 | 默认不允许 |
