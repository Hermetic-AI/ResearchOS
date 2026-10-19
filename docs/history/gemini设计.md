将 **OpenCode** 从单一的“AI 编程助手”二次开发为“科研-数据-代码-论文”全链路学术智能工作站（Academic Agent Workstation） 是一个极具实用价值的方向。

OpenCode 原生具备强大的代码分析、Git 连接以及多端（CLI / Web / Desktop）架构，这为你提供了极佳的技术底座。二次开发的核心思想在于：**以 OpenCode 为调度中枢，将文献、图谱、数据分析与 LaTeX 编写重构为模块化的 SubAgent 与 Standard Skills（MCP 协议）。**

---

## 总体架构设计

整体架构采用 **“1个内核中枢 + 4大专业子智能体 + 模块化技能池”** 的分层设计，保持 OpenCode 核心架构的干净解耦。

```
+-----------------------------------------------------------------------+
|                       OpenCode UI (Desktop / Web / CLI)               |
|   +-------------------+  +-------------------+  +-------------------+ |
|   |  LaTeX/MD Editor  |  | Zotero / Reader   |  | Obsidian Graph UI | |
|   +-------------------+  +-------------------+  +-------------------+ |
+-----------------------------------------------------------------------+
                                    | (RPC / Inter-process Bridge)
+-----------------------------------------------------------------------+
|                    OpenCode Orchestrator (Core Agent)                 |
|                   - Context Manager  - Task Planner                   |
+-----------------------------------------------------------------------+
        |                  |                   |                  |
+---------------+  +---------------+  +---------------+  +---------------+
| SubAgent:     |  | SubAgent:     |  | SubAgent:     |  | SubAgent:     |
| Literature    |  | Knowledge     |  | Data Analysis |  | Paper Writing |
+---------------+  +---------------+  +---------------+  +---------------+
        |                  |                   |                  |
+-----------------------------------------------------------------------+
|             MCP Tools / Unified Skill Pool (Python / TS)              |
| (Zotero DB, Semantic Scholar, PyData, Tectonic/LaTeX, Git/Repo Engine) |
+-----------------------------------------------------------------------+

```

---

## 核心功能模块划分

### 1. 文献管理与元信息提取 (Literature SubAgent)

* **Zotero 本地同步与解析**：直接读取 Zotero 本地 SQLite 数据库或通过 API 获取文献条目，提取 `PDF metadata`、`Abstract` 及 `DOI`。
* **智能检索与关联推荐**：集成 Semantic Scholar、arXiv、Crossref 的 API 技能，根据当前论文内容或关键词自动搜索相关文献并匹配计算相关度。
* **引用生成与 BibTeX 管理**：自动识别文献条目并一键插入精准的 BibTeX 记录，自动格式化引文格式（如 IEEE, Nature, APA）。

### 2. 双链知识图谱 (Knowledge Graph Module)

* **本地双向链接解析**：解析 Markdown/LaTeX 文档中的 `[[文献名/概念]]` 双链语法。
* **图谱可视化与卡片盒笔记**：前端集成 2D/3D 力导向图（Force-Directed Graph），实时呈现文献节点、实验代码文件与笔记卡片之间的关系网络。
* **图谱语义查询**：基于 Graph RAG，支持针对特定“关联图谱簇”进行上下文提问（例如：“找出图谱中所有关于 Transformer 注意力优化的文献与对应代码实现”）。

### 3. 数据分析与实验助手 (Data Science SubAgent)

* **Python 代码隔离沙盒**：封装内置的 Python 执行环境（Jupyter Kernel 或轻量容器/Subprocess），实现安全可控的交互式数据分析。
* **自动化数据处理与出图**：封装 Pandas/NumPy 进行数据清洗、描述性统计；自动调用 Matplotlib/Seaborn/Plotly 生成符合学术出版标准（矢量图 PDF/SVG、300+ DPI）的实验图表。
* **实验日志与数据关联**：将实验生成的数据图表自动关联至对应的代码 commit 与论文 LaTeX 章节中。

### 4. 学术写作与 LaTeX 原生编辑器 (Writing & LaTeX SubAgent)

* **本地 LaTeX 编辑与编译**：集成 Monaco/CodeMirror 基础组件，后台搭配轻量级编译引擎（如 Tectonic 或 SyncTeX），提供实时 PDF 预览与反向跳转。
* **论文写作 Skill**：
* **标题与摘要生成**：根据实验结果与正文内容生成多版本高质标题与 Abstract。
* **润色与格式转换**：支持学术语气重写、被动语态转换、自动将 Markdown 笔记转换为 LaTeX 格式。
* **代码/公式提取**：自动将实验代码提炼为伪代码（Algorithm2e）或将数据表转化为 LaTeX Table 源码。



---

## 技能与子智能体接入规范

为了确保二开代码的维护性，建议遵循 **MCP（Model Context Protocol）** 协议对工具进行封装：

| 模块类别 | 技能名称 (Skill/Tool Name) | 内部实现机制 |
| --- | --- | --- |
| **文献管理** | `zotero_search`, `fetch_bibtex`, `arxiv_query` | Python / TS 脚本 + Zotero 本地数据库/API |
| **知识图谱** | `parse_wikilinks`, `get_graph_nodes` | Rust / JS 语法树解析与图结构提取 |
| **数据分析** | `run_python_analysis`, `generate_academic_chart` | Jupyter Client / Python Sandbox Executor |
| **LaTeX 编译** | `compile_latex`, `latex_format_check` | Tectonic CLI / Latexmk + Synctex 引擎 |
| **代码能力** | `analyze_repo`, `git_diff_summary` | OpenCode 原生 Core Code Engine |

---

## 实施路线图

1. **底座解耦与 Skill/MCP 插件化改造:** 完成二次开发前的基础架构重构.
解耦 OpenCode 核心 Agent 调度逻辑，制定统一的 Skill 扩展规范与 MCP 接口接入标准，建立子智能体（SubAgent）路由分发机制。


2. **文献管理与知识图谱引擎构建:** 依赖 Step 1 的 MCP 工具链规范.
接入 Zotero 本地 SQLite/API 以及 arXiv/Semantic Scholar 工具；实现本地 Markdown/LaTeX 的双链语法解析，生成可视化知识关联图谱。


3. **学术写作与 LaTeX 编辑器集成:** 桌面端 UI 深度整合.
在前端集成 Web-based LaTeX 编辑器（Monaco Editor + Tectonic/PDF 实时渲染），开发论文命名、摘要生成与 BibTeX 语法自动纠错技能。


4. **数据分析沙盒与 SubAgent 协同:** 需确保代码隔离与安全执行.
封装 Python 执行沙盒（Jupyter Kernel 环境），集成 Pandas/Matplotlib/SciPy 等计算库，实现数据智能清洗与学术出版级图表自动绘制。


5. **全流程 Workflow 编排与端到端测试:**
贯通“文献检索 -> 实验数据处理 -> 代码编写/重构 -> 论文撰写与编译”闭环，优化 Prompt 调度链路并完成性能与稳定性测试。


---

## 关键技术难点与规避策略

1. **LaTeX 依赖过重问题**：传统的 TeX Live 体积庞大（数 GB）。建议采用轻量且跨平台的 **Tectonic**（基于 Rust 的 TeX 引擎，按需下载宏包）作为默认编译后端。
2. **数据分析沙盒安全与环境隔离**：避免 Agent 编写的 Python 脚本误删本地系统文件。建议使用独立 Python 虚拟环境，并对文件读写权限进行严格限定。
3. **OpenCode 原生代码侵入度控制**：尽量不直接改动 OpenCode 核心 Agent 逻辑，而是以新增 **Plugin / MCP Server / Skill Custom Package** 的形式外挂接入，降低未来同步 OpenCode 上游更新的难度。