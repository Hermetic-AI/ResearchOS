# 模块四：实验数据分析中心（Data Analysis）技术落地文档

> 交付状态（2026-07-29）：P4.1 Notebook 主链已交付。新增项目级持久 kernel broker（MCP 与 HTTP bridge 共享命名空间、随机 token、启动锁、串行执行、空闲退出）、notebook/cell 持久化与 cells save/run HTTP 端点；前端已替换为真实单元格流，支持保存、Ctrl/Cmd+Enter 执行、stdout/stderr/耗时、数据集画像、统计检验卡、产物安全预览与 artifact↔commit↔LaTeX 关联。`data-analysis` Skill 已补齐。课题级独立 venv 自举仍未交付（当前 uv 环境复用锁定 Python 依赖）；jupyter_client/Optuna 属 v2 扩展。

> 对应总体方案 `docs/ResearchOS最终方案.md` 模块四（3.4 节）与接口契约 5.4 节；UI 对应 `docs/ResearchOS-UI设计.md` 3.6 节。
> 与模块七（科研绘图）的分工：本模块负责"算"——数据清洗、统计检验、探索性出图、实验关联；出版级精修图表、示意图走模块七。两者共享 Python 沙盒与产物库（`.researchos/artifacts/`）。

---

## 1. 模块概述与目标

数据分析中心为科研用户提供"上传数据 → 探索画像 → 统计检验 → 出图 → 关联论文"的闭环：核心是一个受控 Python 沙盒（独立 venv 子进程、工作区内读写、超时与资源上限），其上以 MCP server 形式暴露 `data.run_python / profile / stat_test / chart / link_experiment` 五个工具，由 Data Analysis SubAgent 编排调用；前端为 Notebook 单元格流 + 右侧数据面板，所有产物（图表、统计结果）落盘进 Git 可追踪的本地目录，并能关联到代码 commit 与论文 LaTeX 章节。目标是让 Agent 生成的每一段数据分析代码都可复现、可审查、可追溯。

## 2. 功能清单与范围边界

**做什么（v1）：**

- Python 沙盒：每课题一个独立 venv + 常驻内核子进程（共享命名空间的 REPL，非完整 Jupyter），文件读写限定课题工作区，执行超时与输出大小上限。
- `data.profile`：CSV/Parquet/JSON 数据画像（schema、描述性统计、缺失/异常计数）。
- `data.stat_test`：SciPy 统计检验（t-test / Mann-Whitney / ANOVA / chi2 / Shapiro 正态性 / Pearson/Spearman 相关），输出统计量、p 值、人类可读结论。
- `data.chart`：Matplotlib/Seaborn 学术出图，矢量 PDF/SVG + 300+ DPI PNG，自动生成 LaTeX `\includegraphics` 片段；Plotly 用于前端交互预览。
- `data.link_experiment`：产物 ↔ git commit ↔ LaTeX 章节三元关联入库。
- Notebook 前端：单元格流（代码格 + 输出格）、产物画廊、数据面板（文件列表 / 画像 / 检验结果卡）。

**扩展（v2，接口预留不实现）：**

- Jupyter Kernel 模式（`jupyter_client` 接管内核，支持 rich output / 中断 / 变量检查）。
- 实验设计：Experiment Plan 生成（假设 / 基线 / 数据集 / 指标 / 消融）+ Optuna 参数优化（`data.optuna_optimize`）。

**不做什么：**

- 不做出版级图表精修（模板库、显著性星标、双向调参）——那是模块七（Plot SubAgent / `plot.*` Skill 组）。
- 不做分布式/大数据执行（Spark、Dask 集群），单进程 Pandas 内存内处理，超限明确报错。
- 不做 GUI 交互式绘图编辑器，图表一律代码生成、可 diff。
- 不接管 OpenCode 原生终端/文件工具；沙盒是独立能力，不与 `bash` tool 混用。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| MCP server 框架 | Python `mcp` SDK（FastMCP） | 数据分析生态在 Python；server 直接跑在 venv 内，工具与沙盒同进程，零序列化开销 | MIT |
| 沙盒内核 | 常驻 Python 子进程 + `exec` 共享命名空间（v1）；`jupyter_client`（v2 可选） | v1 无 Jupyter 依赖、启动快、行为可控；v2 换内核不改 MCP 接口 | BSD-3（jupyter_client） |
| 数值/数据处理 | NumPy、Pandas | 科研标准 | BSD-3 |
| 统计检验 | SciPy `scipy.stats` | 检验覆盖全、结果权威 | BSD-3 |
| 机器学习（扩展） | scikit-learn | 预处理/基线模型 | BSD-3 |
| 学术出图 | Matplotlib + Seaborn | 矢量 PDF/SVG 原生支持，rcParams 可做期刊主题 | PSF/BSD-3 |
| 交互预览 | Plotly + Kaleido（静态导出） | 前端数据面板可内嵌交互图；Kaleido 导出与 Matplotlib 产物对齐 | MIT |
| 参数优化（扩展） | Optuna | 轻量、无外部服务、支持 SQLite 后端持久化 study | MIT |
| Parquet 读写 | pyarrow | Pandas 事实标准后端 | Apache-2.0 |
| TS 侧 DB 访问 | `better-sqlite3`（经 `@researchos/data` 封装） | 与 repo 现有本地存储风格一致，同步 API 适合 handler | MIT |
| 前端表格渲染 | `@opencode-ai/ui` 现有组件 + 原生 table | 不引入新表格库，保持 IDE 密度 | — |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| `data.*` 五个工具 | **MCP server**（`researchos-data`，Python FastMCP，`opencode.json` 声明 `{type:"local", command:[...]}`） | 工具实现必须在 venv 内直接访问 NumPy/SciPy；MCP 是总体方案规定的 Skill 统一协议；工具以 `researchos-data_run_python` 等名暴露给所有 Agent |
| 沙盒生命周期管理（venv 创建、内核拉起、健康检查） | MCP server 自管理 + **新 package `@researchos/data`** 提供 TS 侧状态查询 | server 启动时自检/自举 venv；TS 包只读状态供 server handler 与前端使用，不重复管理进程 |
| Notebook 单元格 / 产物 / 关联的持久化与查询 | **新 package `@researchos/data` + 服务端 HttpApiGroup** | 前端（Client）不能依赖 Core/Server 内部实现；按集成点在 `packages/protocol/src/groups/` 新增 group、`packages/server/src/handlers/` 写 handler，`packages/client` 跑 `bun run generate` 生成客户端。DB 文件本身由 MCP server 与 handler 共享读写（WAL 模式） |
| 数据分析工作流编排（"先画像→选检验→出图→关联"） | **SubAgent** `.opencode/agent/data-analyst.md` | 需要独立 system prompt 与工具权限收敛（只给 data.* 与只读文件权限），经内置 TaskTool 调用，不改内核 |
| 统计方法选择知识（何时用哪个检验、假设检验话术） | **Skill** `.opencode/skill/data-analysis/SKILL.md` | 是领域知识/流程提示而非可执行工具，经内置 SkillTool 暴露，SubAgent 与主 Agent 都可用 |
| Notebook 工作区界面 | **app 前端路由页面** `packages/app/src/pages/data-analysis.tsx` | UI 设计 3.6 节定义了完整工作区，属 fork 内 UI 新增面板，不侵入核心 |
| plugin tool（`packages/plugin`） | **不使用** | plugin tool 跑在 OpenCode TS 进程内，调 Python 仍需 spawn 子进程且要自带 JSON 协议，等于重写一个 MCP；无收益 |

## 5. 数据模型与本地存储设计

### 5.1 目录约定（课题工作区内）

```
<project>/
├── .researchos/
│   ├── data-analysis.db        # SQLite，本模块全部结构化状态（WAL 模式）
│   ├── venv/                   # 课题专属 Python 环境（.gitignore）
│   ├── datasets/               # 用户上传/Agent 下载的数据文件（进 Git，>50MB 提示用 LFS）
│   │   └── <dataset_id>.csv
│   ├── artifacts/              # 图表与统计产物（进 Git）
│   │   ├── <artifact_id>.pdf
│   │   ├── <artifact_id>.svg
│   │   ├── <artifact_id>.png   # 300 DPI
│   │   └── <artifact_id>.meta.json
│   └── notebooks/
│       └── <notebook_id>.json  # 单元格顺序与源码快照（cells 表的导出冗余，便于 Git diff）
└── .opencode/
    ├── agent/data-analyst.md
    └── skill/data-analysis/SKILL.md
```

沙盒的文件读写白名单 = 课题根目录；写操作进一步限定 `.researchos/` 与 `datasets/`。校验在内核子进程内做（`pathlib.Path.resolve()` 后检查前缀），拒绝即抛 `SandboxViolation`。

### 5.2 SQLite DDL（`.researchos/data-analysis.db`）

MCP server 首启动时执行 `CREATE TABLE IF NOT EXISTS`，schema 版本用 `PRAGMA user_version` 管理迁移。

```sql
-- 数据集登记
CREATE TABLE datasets (
  id TEXT PRIMARY KEY,              -- ds_ + ulid
  name TEXT NOT NULL,
  path TEXT NOT NULL,               -- 相对课题根的路径
  format TEXT NOT NULL,             -- csv | parquet | json
  size_bytes INTEGER NOT NULL,
  profile_json TEXT,                -- data.profile 结果缓存（JSON）
  created_at INTEGER NOT NULL
);

-- Notebook（一个课题可有多个，如 "baseline 分析"、"消融实验"）
CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,              -- nb_ + ulid
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 单元格：代码 + 执行结果快照
CREATE TABLE cells (
  id TEXT PRIMARY KEY,              -- cell_ + ulid
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,        -- 单元格顺序
  source TEXT NOT NULL,             -- Python 源码
  status TEXT NOT NULL DEFAULT 'idle',  -- idle | running | ok | error
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  executed_at INTEGER,
  kernel_snapshot TEXT              -- 预留：v2 Jupyter 模式 execution_count 等
);
CREATE INDEX idx_cells_notebook ON cells(notebook_id, position);

-- 产物（图表、导出表格、统计报告）
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,              -- art_ + ulid
  cell_id TEXT REFERENCES cells(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,               -- chart | table | report | model
  path TEXT NOT NULL,               -- .researchos/artifacts/ 下主文件
  preview_path TEXT,                -- 前端预览用 svg/png
  format TEXT NOT NULL,             -- pdf | svg | png | csv | json
  dpi INTEGER,
  latex_snippet TEXT,               -- \begin{figure}...\end{figure}
  spec_json TEXT,                   -- data.chart 的 kind/spec 入参快照（可复现）
  created_at INTEGER NOT NULL
);

-- 产物 ↔ commit ↔ 论文章节 关联（data.link_experiment 写入）
CREATE TABLE artifact_links (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  git_commit TEXT,                  -- 40 位 sha，可为空（工作区非 git 时）
  tex_file TEXT,                    -- 相对路径，如 paper/main.tex
  tex_section TEXT,                 -- 如 "sec:experiments" 或 "4.2"
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, tex_file, tex_section)
);

-- 统计检验记录（数据面板"检验结果卡"数据源）
CREATE TABLE stat_tests (
  id TEXT PRIMARY KEY,
  dataset_id TEXT REFERENCES datasets(id) ON DELETE SET NULL,
  cell_id TEXT REFERENCES cells(id) ON DELETE SET NULL,
  test TEXT NOT NULL,               -- ttest | mannwhitney | anova | chi2 | ...
  columns_json TEXT NOT NULL,       -- 参与列与参数
  statistic REAL,
  p_value REAL,
  conclusion TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

设计要点：

- `artifacts.spec_json` 存完整入参 → 任何图表可用同一 `data.chart` 调用重放，满足"可复现"。
- `cells.source + stdout` 与 `notebooks/<id>.json` 冗余：DB 供查询，JSON 文件供 Git diff/审阅，导出由 server 在每次 cell 执行后同步写。
- v2 Optuna：`study` 用 Optuna 自带 SQLite 后端单独存 `.researchos/optuna.db`，不进本表，避免 schema 耦合。

## 6. 核心接口实现

### 6.1 MCP server 启动与注册

`opencode.json`（课题级或全局）：

```json
{
  "mcp": {
    "researchos-data": {
      "type": "local",
      "command": [
        ".researchos/venv/bin/python",
        "-m",
        "researchos_data_mcp",
        "--workdir", "."
      ],
      "enabled": true
    }
  }
}
```

Windows 下 command 由启动脚本解析为 `.researchos/venv/Scripts/python.exe`。首次启动时 server 自举：检测 venv 不存在则 `python -m venv` 创建并 `pip install` 锁定依赖（`requirements.lock` 随 `@researchos/data` 包发布），状态写入 DB 的 `meta` 表供前端显示"沙盒环境 · 仅限工作区读写"。

工具暴露名：`researchos-data_run_python`、`researchos-data_profile`、`researchos-data_stat_test`、`researchos-data_chart`、`researchos-data_link_experiment`（`{server}_{tool}` 规则）。

### 6.2 TS 侧类型契约（`@researchos/data`）

MCP 工具本体在 Python，但 server handler、SubAgent 提示词、前端共用一份类型定义，放在 `packages/researchos-data/src/contract.ts`：

```ts
// packages/researchos-data/src/contract.ts
import { z } from "zod"

export const RunPythonInput = z.object({
  code: z.string(),
  workdir: z.string(),                    // 相对课题根，沙盒前缀校验的基准
  timeout_s: z.number().int().min(1).max(600).default(120),
  cell_id: z.string().optional(),         // 前端单元格调用时带上，用于结果落库
})
export const RunPythonOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  artifacts: z.array(z.string()),         // 本次执行新增的产物路径
  duration_ms: z.number(),
  error: z.object({ type: z.string(), message: z.string(), traceback: z.string() }).optional(),
})

export const ProfileInput = z.object({ file: z.string() })
export const ProfileOutput = z.object({
  schema: z.array(z.object({
    name: z.string(),
    dtype: z.string(),                    -- "numeric" | "categorical" | "datetime" | "text"
    null_count: z.number(),
    unique_count: z.number(),
  })),
  stats: z.record(z.string(), z.object({  -- 仅数值列：mean/std/min/p25/p50/p75/max
    mean: z.number(), std: z.number(), min: z.number(),
    p25: z.number(), p50: z.number(), p75: z.number(), max: z.number(),
  }).partial()),
  anomalies: z.array(z.object({
    column: z.string(),
    kind: z.string(),                     -- "high_null_ratio" | "outlier_iqr" | "constant" | "dup_rows"
    detail: z.string(),
  })),
})

export const StatTestInput = z.object({
  file: z.string(),
  test: z.enum(["ttest", "mannwhitney", "anova", "kruskal", "chi2", "shapiro", "pearson", "spearman"]),
  columns: z.array(z.string()).min(1),
  params: z.record(z.string(), z.unknown()).optional(),  -- 如 { group_col, equal_var: false }
})
export const StatTestOutput = z.object({
  statistic: z.number(),
  p_value: z.number(),
  conclusion: z.string(),                 -- 含效应量与显著性判读的中文结论
  test_id: z.string(),                    -- 写入 stat_tests 表
})

export const ChartInput = z.object({
  file: z.string(),
  kind: z.enum(["line", "bar", "scatter", "hist", "box", "heatmap", "pair"]),
  spec: z.record(z.string(), z.unknown()), -- { x, y, hue, title, xlabel, theme: "nature"|"ieee" }
  format: z.enum(["pdf", "svg", "png"]),
  dpi: z.number().int().min(72).max(1200).default(300),
})
export const ChartOutput = z.object({
  artifact_path: z.string(),
  preview_svg: z.string(),                -- 始终生成 svg 供前端预览
  latex_snippet: z.string().optional(),
  artifact_id: z.string(),
})

export const LinkExperimentInput = z.object({
  artifact_path: z.string(),
  commit: z.string().optional(),          -- 缺省取当前 HEAD
  tex_file: z.string().optional(),
  tex_section: z.string().optional(),
})
export const LinkExperimentOutput = z.object({ ok: z.literal(true) })
```

### 6.3 Python 侧实现要点

**沙盒内核（v1，`kernel.py`）**：MCP server 进程即内核宿主，启动一个独立子进程 `python -u kernel_worker.py`，父子间走 stdio JSON-RPC（每行一条消息）：

```
run_python(code, workdir, timeout_s):
  1. workdir 前缀校验：resolve(workdir) 必须以课题根为前缀，否则 SandboxViolation
  2. 向 worker 发送 {op:"exec", code, workdir}
  3. worker 内：os.chdir(workdir)；contextlib.redirect_stdout/stderr 到 StringIO；
     exec(code, GLOBAL_NS)  # GLOBAL_NS 进程级共享，实现单元格间变量延续
  4. 超时：父进程 asyncio.wait_for；超时则 worker.terminate() 并重启 worker
     （共享命名空间丢失 → stderr 明确提示 "kernel restarted due to timeout"）
  5. 输出截断：stdout/stderr 各限 64KB，超出截断并追加 "[truncated]"
  6. 执行后扫描 .researchos/artifacts/ mtime 变化 → 得出 artifacts 列表并登记 artifacts 表
```

- 网络出站：v1 不做系统级隔离（跨平台成本过高），在 worker 启动时 monkey-patch `socket.create_connection` 对白名单外域名抛错（白名单 = PyPI，用于 Optuna 等扩展安装）；系统级 sandbox（Windows Job Object / macOS sandbox-exec）列为开放问题。
- 资源上限：内存用 `resource.setrlimit`（Unix）/ Job Object（Windows）做 best-effort；v1 硬性保证的只有超时与输出上限，文档与 UI 提示条如实说明。

**`stat_test`**：纯 Python 分发到 `scipy.stats`，要点是"结论生成"——统一模板：

```python
# 伪代码
def stat_test(file, test, columns, params):
    df = load(file)
    result = dispatch[test](df, columns, params)   # scipy.stats.ttest_ind 等
    effect = effect_size(test, df, columns)        # Cohen's d / eta^2 / Cramér's V
    conclusion = f"{test_name}: 统计量={result.statistic:.4g}, p={result.pvalue:.4g}；" \
                 f"{'拒绝' if result.pvalue < alpha else '不能拒绝'}原假设（α=0.05），效应量 {name}={effect:.3f}"
    db.insert_stat_test(...)
    return result
```

**`chart`**：统一入口先套学术 rcParams 主题，再分发，最后多格式导出：

```python
THEMES = {
  "nature": {"font.family": "sans-serif", "font.size": 7, "axes.linewidth": 0.5, ...},
  "ieee":   {"font.family": "serif", "font.size": 8, "figure.figsize": (3.5, 2.6), ...},
}

def chart(file, kind, spec, format, dpi):
    df = load(file)
    with matplotlib.rc_context(THEMES[spec.get("theme", "nature")]):
        fig = render[kind](df, spec)               # seaborn.lineplot / plt.scatter / sns.heatmap ...
    artifact_id = new_id("art")
    paths = export(fig, artifact_id, format, dpi)  # pdf/svg: bbox_inches="tight"; png: dpi>=300
    preview = export_svg(fig, artifact_id)         # 预览恒为 svg
    snippet = latex_figure(paths.main, spec)       # \begin{figure}[t]...\caption{}...\end{figure}
    db.insert_artifact(spec_json={"kind": kind, "spec": spec, ...})
    return {...}
```

**`link_experiment`**：

```
1. artifact_path → 查 artifacts 表得 artifact_id（不存在则报错）
2. commit 缺省：subprocess git rev-parse HEAD（非 git 工作区则存 NULL，不报错）
3. tex_section 校验：ripgrep 风格扫描 tex_file 中 \section{}/\label{}，匹配不到则
   返回 warning 但仍写入（用户可能随后补 section）
4. upsert artifact_links
```

### 6.4 服务端 HttpApiGroup（前端数据源）

按集成点新增 `DataAnalysis` group：

- `packages/protocol/src/groups/data-analysis.ts`：定义 `GET /data/datasets`、`GET /data/notebooks/:id/cells`、`GET /data/artifacts`、`POST /data/cells/:id/run`（透传到本地 MCP？——否。前端执行 cell 走 server handler → 复用 `@researchos/data` 的 DB + 直接 spawn 同一 kernel client，见下）、`POST /data/artifacts/:id/link`、`GET /data/stat-tests`。
- `packages/protocol/src/api.ts` 注册 group。
- `packages/server/src/handlers/data-analysis.ts`：handler 通过 `@researchos/data` 读写 `.researchos/data-analysis.db`；cell 执行不复用 MCP 通道（那是 Agent 的通道），而是调用 `@researchos/data` 导出的 `KernelClient`——它与 MCP server 连同一个 worker（kernel worker 监听 unix socket / named pipe，MCP server 与 KernelClient 都是客户端），保证"Agent 跑的代码"与"用户点的运行"在同一个命名空间。
- `packages/client` 执行 `bun run generate` 重新生成客户端（`src/generated*` 不手改）。

`@researchos/data` 包结构：

```
packages/researchos-data/
├── src/
│   ├── contract.ts      # 6.2 的 zod 契约（前后端与 SubAgent prompt 共用）
│   ├── db.ts            # better-sqlite3 打开/迁移/查询（纯函数，非 Effect 服务）
│   ├── kernel-client.ts # 连接 kernel worker 的 JSON-RPC 客户端
│   └── sandbox-status.ts# venv/kernel 健康状态读取（底部状态栏用）
├── python/
│   ├── researchos_data_mcp/   # FastMCP server（pip install -e 进 venv）
│   ├── kernel_worker.py
│   ├── requirements.lock
│   └── tests/
└── package.json         # name: "@researchos/data"
```

依赖方向：`protocol`/`server` → `@researchos/data`；`@researchos/data` 不依赖 `core`，符合 AGENTS.md 的依赖约束。

## 7. SubAgent 与 Skill 定义

### 7.1 `.opencode/agent/data-analyst.md`

```markdown
---
description: 实验数据分析专家——数据画像、统计检验、学术出图与实验关联。当任务涉及 CSV/Parquet 数据处理、显著性检验、生成实验图表时调用。
mode: subagent
model: inherit
color: "#56b6c2"
permission:
  edit: deny
  bash: deny
  webfetch: deny
---

你是一名严谨的科研数据分析师，工作在一个沙盒化的 Python 环境中。

## 工具
你只能通过 `researchos-data_*` 系列 MCP 工具操作数据（run_python / profile / stat_test / chart / link_experiment），以及只读文件工具查看工作区。沙盒仅限课题工作区内读写，不要尝试访问外部路径。

## 标准工作流
1. **先画像**：拿到数据文件，第一步永远调用 `researchos-data_profile`，把 schema、缺失、异常作为后续分析的上下文。
2. **再检验**：调用 SkillTool 加载 `data-analysis` skill 确认该场景该用哪个统计检验；优先参数检验，正态性（shapiro）不满足时换非参数检验并在结论中说明。
3. **后出图**：用 `researchos-data_chart` 出图，默认 theme="nature"、format="pdf"（同时会得到 svg 预览）；探索性分析可直接用 run_python + matplotlib。
4. **必关联**：每张进入论文的图，调用 `researchos-data_link_experiment` 关联当前 commit 与目标 tex 章节。

## 纪律
- 所有分析代码经 run_python 执行，单元格粒度要小（一次做一件事），便于用户在 Notebook 界面审查与重跑。
- 统计结论必须包含：检验名、统计量、p 值、α=0.05 的判读、效应量。不夸大显著性，p≥0.05 时明确说"差异不显著"。
- 不修改用户论文与代码文件（edit 权限已关闭）；LaTeX 片段通过 chart 返回值交付，由主 Agent 或用户插入。
```

### 7.2 `.opencode/skill/data-analysis/SKILL.md`

```markdown
---
name: data-analysis
description: 科研统计检验选择指南与数据分析流程规范。当需要做假设检验、选择统计方法、解读 p 值、或组织实验分析 Notebook 时使用。
---

# 科研数据分析规范

## 检验选择决策树

1. 两组独立样本均值比较：
   - 先 shapiro 查正态性 + levene 查方差齐性
   - 正态且方差齐 → `ttest`（params.equal_var=true）
   - 正态但方差不齐 → `ttest`（equal_var=false，即 Welch）
   - 非正态 → `mannwhitney`
2. 三组及以上：正态 → `anova`（事后 Tukey）；非正态 → `kruskal`
3. 分类变量关联 → `chi2`（期望频数 <5 的格超过 20% 时警告，建议 Fisher 精确检验——用 run_python 调 scipy.stats.fisher_exact）
4. 连续变量相关：正态 → `pearson`；非正态/等级 → `spearman`

## 报告话术

- 显著（p<0.05）：「差异具有统计学意义（统计量=X.XX, p=0.XXX, 效应量 d=0.XX）」
- 不显著：「未发现统计学显著差异（p=0.XXX），注意这不证明无差异，可能是功效不足」
- 多重比较必须提校正（Bonferroni / FDR），哪怕本次未做也要标注局限。

## Notebook 组织约定

- 一个研究问题一个 notebook；单元格顺序：加载 → 画像 → 清洗 → 检验 → 出图。
- 每个出图单元格之后紧跟一次 link_experiment，保持产物可追溯。
- 图表进论文前 theme 统一为 venue 对应主题（IEEE 会议用 "ieee"，其余默认 "nature"）。
```

## 8. 前端界面落地

路由：在 `packages/app/src/app.tsx` 的 `Routes()` 新增 `<Route path="/data" component={DataAnalysisPage} />`；侧栏 icon rail 在 `packages/app/src/pages/layout/sidebar-shell.tsx` 增加 `∑ 数据分析`入口。页面文件与组件拆分：

```
packages/app/src/pages/data-analysis.tsx          # 页面壳：左 Notebook 流 + 右数据面板两栏布局
packages/app/src/components/data/
├── notebook-stream.tsx     # 单元格列表（可拖拽排序、追加 cell）
├── notebook-cell.tsx       # 代码格：mono 字体、行号、运行按钮、状态徽标（venv/时长）
├── cell-output.tsx         # 输出格：按类型分发 table / stats / image(svg) / error
├── artifact-gallery.tsx    # 产物画廊：缩略图时间线、300DPI 徽标、引用状态
├── artifact-actions.tsx    # “插入到论文 §X”“关联 commit”按钮 → 调 client 的 link API
└── data-panel.tsx          # 右侧面板：数据集列表 / 画像卡 / stat_tests 结果卡
```

实现要点：

- 数据源全部走 `packages/client` 生成的 SDK（6.4 的 group），不直接 fetch。
- 单元格编辑器不做 Monaco（LaTeX 编辑器才用），用 `<textarea>` + 语法高亮 overlay 即可，保持轻量；代码主题令牌用 `bg-background-base` / `text-text-base` 等 `@opencode-ai/ui` Tailwind 类。
- 图表预览直接渲染后端返回的 `preview_svg` 字符串（`innerHTML` 注入前过一道 allowlist sanitize）；点击放大用现有 Dialog 组件。
- 顶部固定安全提示条：`沙盒环境 · 仅限工作区读写 · 超时 120s`，底色 `bg-surface-base`，图标复用 ui 包的 Icon。
- 底部状态栏数据（`venv: py3.12`）由 `sandbox-status.ts` 经 group 的 `GET /data/sandbox/status` 供给。
- SubAgent 标签配色遵循 UI 设计：数据 Agent = 青 `#56b6c2`（与 `.opencode/agent/data-analyst.md` frontmatter 的 `color` 一致）。
- Agent Dock 复用全局组件，进入本页时自动 `@数据集` 带上当前选中数据集上下文。

## 9. 开发步骤与里程碑

| 周 | 任务 | 依赖 | 可验证成果 |
| --- | --- | --- | --- |
| W1 | 建 `packages/researchos-data` 骨架；`contract.ts` 五个 zod 契约冻结；SQLite DDL + `db.ts` 迁移逻辑；`requirements.lock` 冻结依赖版本 | 无 | 包内 `bun test` 过 DB 迁移单测 |
| W2 | Python kernel worker + JSON-RPC（exec/超时/重启/输出截断/路径白名单）；FastMCP server 暴露 `run_python` | W1 | OpenCode 注册 MCP 后，Agent 可执行 Python 且越界写入被拒 |
| W3 | `profile` + `stat_test`（scipy 分发、效应量、结论模板、stat_tests 落库） | W2 | 对示例 CSV 输出画像与 t 检验结论 |
| W4 | `chart`（nature/ieee 主题、pdf/svg/png 导出、latex_snippet、artifacts 落库）+ `link_experiment` | W2 | 出版级 PDF 图 + 关联记录可查 |
| W5 | protocol group + server handler + `bun run generate`；KernelClient 与 MCP 共连 worker | W1, W4 | curl 服务端接口返回 datasets/cells/artifacts |
| W6 | 前端页面与组件（8. 节全部）；侧栏入口；沙盒状态条 | W5 | 浏览器内跑通"上传 CSV → 运行 cell → 出图 → 关联" |
| W7 | SubAgent `data-analyst.md` + Skill `SKILL.md` 联调；端到端演示脚本 | W3–W6 | TaskTool 唤起 Data Agent 完成完整分析流 |
| W8（缓冲） | v2 评估：jupyter_client 内核、Optuna `data.optuna_optimize`、系统级 sandbox | W7 | 评审后决定是否排期 |

## 10. 测试方案

遵守规则：测试一律在包目录内运行，不在 repo 根目录跑。

- **TS 单测**（`packages/researchos-data`，`bun test`）：
  - `db.test.ts`：内存 SQLite 跑迁移 → DDL 幂等（连跑两次不报错）、artifact_links upsert 语义。
  - `contract.test.ts`：五个 zod schema 对合法/非法入参的解析（非法 dpi、未知 test 枚举被拒）。
  - `kernel-client.test.ts`：真起 `kernel_worker.py` 子进程（测试机需有 Python），验证 exec、变量跨调用延续、超时终止与 worker 重启、越界路径 SandboxViolation。不用 mock——worker 本身就是最轻量的真实依赖。
- **Python 单测**（`packages/researchos-data/python/tests`，pytest，在该目录运行）：`stat_test` 各检验对构造数据集的统计量/p 值快照；`chart` 导出文件存在性、PNG DPI 元数据 ≥300、PDF/SVG 为矢量（无栅格化）；`profile` 对缺失/异常列的判定。
- **server handler 测试**（`packages/server`，跟随该包既有测试模式）：临时目录造 `.researchos/data-analysis.db` fixture，打 group 各端点断言响应。
- **集成测试**（`packages/researchos-data/python/tests/test_mcp_e2e.py`）：以 stdio 拉起 FastMCP server，用 MCP client 依次调 `profile → stat_test → chart → link_experiment`，断言 DB 落库与产物文件；跑在非 Windows CI 上（Windows 本地手测 venv 路径分支）。
- **前端**：不新增测试框架，随 `packages/app` 现有约定走 typecheck + 手动验证清单（单元格增删跑、画廊渲染、关联弹窗）。
- 每个改动包内执行 `bun typecheck`（在对应 package 目录）。

## 11. 风险与开放问题

1. **跨平台资源隔离不完整**：超时与输出上限可硬保证；内存/CPU 上限在 Windows 依赖 Job Object、macOS 无 setrlimit 等效物，v1 只做 best-effort。开放问题：是否引入容器化执行（Docker/Podman）作为可选强隔离档——与代码复现模块的 Docker 能力复用。
2. **共享命名空间的双客户端一致性**：KernelClient（前端运行）与 MCP server（Agent 运行）连同一 worker，需串行化 exec 请求（worker 内单队列）；并发提交时前端要显示"排队中"。已按此设计，但排队 UX 待 W6 验证。
3. **超时杀 worker 丢命名空间**：v1 语义是"超时即重启、变量清空"，对用户有惊扰。缓解：cell 粒度纪律写进 SubAgent prompt + UI 在 kernel 重启后给出明确 toast；v2 Jupyter 模式支持 interrupt 而非 kill。
4. **大文件边界**：Pandas 内存内处理，单文件 >1GB 会 OOM。v1 在 `profile`/`chart` 入口做 size 检查并明确报错引导采样；是否引入 DuckDB 做 out-of-core 查询列为开放问题（license MIT，收益真实但超本期范围）。
5. **依赖体积**：NumPy/Pandas/SciPy/Matplotlib/Kaleido 全量约 400MB venv。按课题各建 venv 会重复占用磁盘；开放问题：是否做全局共享 venv + 每课题 `.pth` 隔离，或接受重复换隔离性（当前选择后者）。
6. **Plotly 双栈成本**：探索预览用 Plotly、出版导出用 Matplotlib，两套图可能视觉不一致。v1 约定"进论文的图一律 Matplotlib"，Plotly 仅前端面板交互展示，不导出产物。
7. **上游同步**：本模块对 fork 的侵入点为 `app.tsx` 路由一行、sidebar-shell 入口一处、protocol `api.ts` 注册一行，均在合并冲突高发文件上；rebase 上游时优先处理这三处。
