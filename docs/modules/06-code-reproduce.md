# 模块六：代码复现中心（Code Reproduce）技术落地文档

> 实现状态（2026-07-29）：v1 已完成。创建 run 仅持久化，不隐式执行；六步通过 HTTP 或 MCP 显式推进，真实 clone/分析/检测/运行/比对的日志、指标和诊断均保存在 `.researchos/reproduce/`。App 已提供历史 run、步骤证据、论文指标录入、比对卡与四类诊断视图。

> 对应总体方案 `docs/ResearchOS最终方案.md` 模块六与 5.7 节；UI 对应 `docs/ResearchOS-UI设计.md` 3.8 节。
> 核心原则：**完全复用 OpenCode 原生 coding agent / GitHub 连接 / Repo 理解能力，复现流水线以 `reproduce.paper` Skill 编排实现，不改内核。**

---

## 1. 模块概述与目标

代码复现中心解决"拿到一篇论文和它的官方仓库后，能否在本机把结果跑出来"这一科研高频痛点。用户输入论文 URL + Repo URL，系统编排一条六步流水线（Clone → 代码分析 → 环境检测 → Docker/venv 生成 → 运行实验 → 结果比对），每一步由 OpenCode 原生 coding agent 在真实仓库工作区内执行，产物落库持久化。最终交付三样东西：**论文报告值 vs 复现值比对卡**、**四类问题（版本/依赖/参数/数据）的复现诊断报告**、以及可继续对话追问的 **Repo 智能面板**。整个模块以 `@researchos/reproduce` 新包 + MCP server + Skill + SubAgent + app 前端路由页面的组合形态落地，OpenCode 核心零侵入。

## 2. 功能清单与范围边界

### 做什么

- **复现流水线编排**：`reproduce.paper` Skill 编排六步流水线，步骤状态机持久化，支持中断后续跑（从失败步骤重试）。
- **Clone 与 Repo 理解**：复用 OpenCode 原生 GitHub 连接与 repo 理解（文件树、符号搜索、README/配置解析），识别实验入口脚本（train.py / main.py / Makefile / 论文声明的命令）。
- **环境检测**：解析 `requirements.txt` / `environment.yml` / `pyproject.toml` / `setup.py` / Dockerfile，提取 Python 版本、依赖及版本约束、CUDA/cuDNN 要求、系统依赖。
- **环境生成**：二选一策略——优先生成 **Docker**（`Dockerfile.reproduce` + 构建），无 Docker 或用户选择时回退 **venv/conda**；生成物写入复现工作区并入库。
- **运行实验**：在生成的环境内执行入口命令，采集 stdout/stderr、退出码、运行时长、产物文件（checkpoint、metrics.json、日志），设超时与资源上限。
- **结果比对**：从论文（PDF/网页/arXiv abstract）提取报告指标（模型/数据集/指标名/数值），从运行产物提取复现值，生成并排比对卡与差异高亮（容差可配，默认相对误差 ≤1% 记为 Match）。
- **复现诊断报告**：失败或差异时产出四类问题清单——**版本**（框架/CUDA/Python 不匹配）、**依赖**（缺包/版本冲突/未声明依赖）、**参数**（随机种子、超参、配置缺省值）、**数据**（数据集缺失/路径错误/preprocess 未跑）。
- **Repo 智能面板**：前端展示文件树、符号搜索、诊断报告，并可通过 Agent Dock 继续追问（会话上下文携带 run 记录）。

### 不做什么

- **不做集群/远程算力调度**：只在本地 Docker 或 venv 执行；GPU 仅做检测与提示，不做资源编排。
- **不做自动改论文代码修 bug 的无人值守闭环**：诊断报告给出建议补丁（diff），但应用与否走 OpenCode 原生 diff review，由用户确认。
- **不修改 OpenCode 核心**：不碰 `SessionPrompt.loop`、tool loop、内核调度；全部经 MCP/Skill/SubAgent/新包外挂。
- **不做论文全文深度解析**：指标提取以摘要/实验章节的正则 + LLM 抽取为主，不接 GROBID（那是文献模块的可选增强）。
- **不保证"必能复现"**：目标是把"为什么不能复现"诊断清楚，而非承诺数值一致。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 流水线编排 | OpenCode Skill（`reproduce.paper`）+ `@researchos/reproduce` 编排器 | 总体方案 5.7 已定：Skill 编排原生 coding 能力，不改内核 | MIT（自研） |
| 工具暴露协议 | MCP local server（stdio，`bun run`） | OpenCode 原生支持；MCP 工具以 `{server}_{tool}` 暴露给模型 | MIT |
| 本地存储 | SQLite（bun:sqlite） | 本地优先、零外部依赖，与其他 ResearchOS 模块同策略 | 内置 |
| Git 克隆 | `git clone --depth 1`（shell）+ OpenCode GitHub 连接 | 复用原生能力，避免引入 isomorphic-git 等冗余依赖 | — |
| 环境隔离 A | Docker Engine（`docker build` / `docker run` CLI） | 复现可信度的黄金标准；用户机器已有 Docker 时优先 | Apache-2.0 |
| 环境隔离 B | Python `venv` / `uv`（备选） | 无 Docker 场景回退；`uv` 解析依赖快且可锁版本 | Apache-2.0 / MIT |
| 依赖解析 | 自研解析器（requirements/environment.yml/pyproject）+ `pipdeptree`（运行时校验） | 格式简单，正则 + TOML/YAML 解析即可；避免重库 | MIT（pipdeptree） |
| 论文指标提取 | arXiv API / Crossref（元数据）+ LLM 抽取（经原生 coding agent） | 不重造 PDF 解析；复用 Agent 的网页/文件读取 | — |
| YAML 解析 | `yaml`（已在依赖树中） | environment.yml 解析 | MIT |
| 前端 | SolidJS + `@opencode-ai/ui`（Tailwind 令牌） | 与 packages/app 技术栈一致 | MIT |
| 步骤可视化 | 自研 Stepper 组件（无新依赖） | 步骤条简单，引入库不值得 | — |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| 流水线状态机、SQLite 读写、环境检测/生成/运行的确定性逻辑 | **新 package `@researchos/reproduce`**（`packages/researchos-reproduce`） | 确定性流程不应交给 LLM 逐步决策；包化后可被 MCP server、server handler、测试三处复用。不依赖 Core/Server，保持 Client→Schema/Protocol 的依赖方向 |
| 面向模型的工具接口（`reproduce_*`） | **MCP local server**（`packages/researchos-reproduce/src/mcp.ts`，`opencode.json` 的 `mcp` 键声明） | 模型侧（含 SubAgent 与原生 agent）通过标准 MCP 调用流水线；工具名自动变为 `reproduce_start` 等 |
| 顶层编排入口 `reproduce.paper` | **Skill**（`.opencode/skill/reproduce.paper/SKILL.md`） | 总体方案 5.7 明确该接口以 Skill 编排实现；Skill  instruct 原生 agent 依次调 MCP 工具并在每步之间做代码理解与修复 |
| 复现诊断对话（"为什么无法复现"） | **SubAgent**（`.opencode/agent/reproduce.md`，`mode: "subagent"`） | 诊断需要多轮 repo 探索 + 日志分析，封装为专职 SubAgent 经 TaskTool 调用，不污染主会话上下文 |
| 流水线状态查询/详情的 HTTP 接口 | **protocol HttpApiGroup + server handler**（`packages/protocol/src/groups/reproduce.ts` 注册进 `api.ts`，handler 在 `packages/server/src/handlers/reproduce.ts`，`packages/client` 跑 `bun run generate`） | 前端 Stepper 视图需要轮询状态；这是事实清单中既定的服务端持久化扩展路径，generated 目录不手改 |
| 流水线 Stepper 视图、比对卡、Repo 面板 | **app 前端路由页面**（`packages/app/src/pages/reproduce.tsx` + 子组件，路由注册进 `app.tsx` 的 `Routes()`，侧栏 icon rail 加入口） | UI 设计 3.8 的既定形态；复用 `@opencode-ai/ui` 主题令牌 |

**为什么不是 plugin tool**：`packages/plugin` 的 `tool()` 适合给 agent 加轻量工具，但本模块需要独立的 SQLite 连接、长任务进程管理（docker run 可能跑数小时）和 HTTP 查询面，MCP server（独立进程）+ 新包是更干净的边界。plugin 仅在需要 hook 会话事件时才引入，本模块不需要。

## 5. 数据模型与本地存储设计

### 5.1 目录约定

复现工作区放在课题目录下，全部产物可 Git 管理或整体删除：

```
<project>/.researchos/reproduce/
├── reproduce.db                  # SQLite，流水线状态与结果
└── runs/
    └── <run_id>/                 # 例: 01JEXAMPLE...
        ├── repo/                 # git clone 目标（--depth 1）
        ├── env/
        │   ├── Dockerfile.reproduce
        │   ├── requirements.lock 或 environment.lock
        │   └── env-report.json   # reproduce_env_detect 的原始输出
        ├── logs/
        │   ├── step-<n>-<name>.log
        │   └── run.stdout.log / run.stderr.log
        ├── artifacts/            # metrics.json、checkpoint 清单、产出图
        ├── patches/              # 诊断建议的 diff（未应用）
        └── report.md             # 复现诊断报告（人读）
```

### 5.2 SQLite DDL

遵循 AGENTS.md：snake_case 字段名，不为列重定义字符串名。

```sql
CREATE TABLE IF NOT EXISTS reproduce_run (
  id TEXT PRIMARY KEY,                -- ulid
  project_id TEXT NOT NULL,
  paper_url TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  repo_commit TEXT,                   -- clone 后记录 HEAD sha
  status TEXT NOT NULL,               -- pending|running|completed|failed|cancelled
  current_step INTEGER NOT NULL DEFAULT 0,
  env_strategy TEXT,                  -- docker|venv
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reproduce_step (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reproduce_run(id),
  seq INTEGER NOT NULL,               -- 1..6
  name TEXT NOT NULL,                 -- clone|analyze|env_detect|env_generate|run|compare
  status TEXT NOT NULL,               -- pending|running|completed|failed|skipped
  log_path TEXT,
  output_json TEXT,                   -- 步骤结构化输出（入口命令、环境清单等）
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE(run_id, seq)
);

CREATE TABLE IF NOT EXISTS reproduce_metric (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reproduce_run(id),
  model TEXT NOT NULL,
  dataset TEXT NOT NULL,
  metric TEXT NOT NULL,               -- 如 accuracy / fid / bleu
  paper_value REAL,
  repro_value REAL,
  tolerance REAL NOT NULL DEFAULT 0.01,  -- 相对容差
  verdict TEXT,                       -- match|mismatch|missing_repro|missing_paper
  source TEXT NOT NULL,               -- paper_extract|run_artifact
  note TEXT
);

CREATE TABLE IF NOT EXISTS reproduce_issue (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reproduce_run(id),
  category TEXT NOT NULL,             -- version|dependency|parameter|data
  severity TEXT NOT NULL,             -- blocker|warning|info
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  evidence TEXT,                      -- 日志片段/文件:行号
  patch_path TEXT,                    -- 建议 diff（.researchos/reproduce/runs/<id>/patches/）
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_step_run ON reproduce_step(run_id);
CREATE INDEX IF NOT EXISTS idx_metric_run ON reproduce_metric(run_id);
CREATE INDEX IF NOT EXISTS idx_issue_run ON reproduce_issue(run_id);
```

`reproduce.db` 由 `@researchos/reproduce` 独占打开（WAL 模式），server handler 与 MCP server 同进程内共享同一连接实例；跨进程时以"后开者只读查询"兜底，避免写锁竞争。

## 6. 核心接口实现

### 6.1 包结构

```
packages/researchos-reproduce/
├── package.json            # name: @researchos/reproduce
├── src/
│   ├── index.ts            # 公共导出（编排器 + store + 类型）
│   ├── store.ts            # SQLite 访问层（bun:sqlite，DDL 迁移）
│   ├── pipeline.ts         # 六步状态机编排器
│   ├── steps/
│   │   ├── clone.ts
│   │   ├── analyze.ts      # 依赖声明解析 + 入口探测（确定性部分）
│   │   ├── env-detect.ts
│   │   ├── env-generate.ts # Dockerfile / venv 生成
│   │   ├── run.ts          # docker run / venv 子进程，超时与日志落盘
│   │   └── compare.ts      # 指标提取结果对齐与 verdict 计算
│   ├── diagnose.ts         # 四类问题归类的规则引擎
│   └── mcp.ts              # MCP stdio server 入口
└── test/
    ├── store.test.ts
    ├── env-detect.test.ts
    └── compare.test.ts
```

### 6.2 MCP 工具签名

`mcp.ts` 用 `@modelcontextprotocol/sdk` 起 stdio server，`opencode.json` 声明：

```json
{
  "mcp": {
    "reproduce": {
      "type": "local",
      "command": ["bun", "run", "packages/researchos-reproduce/src/mcp.ts"]
    }
  }
}
```

暴露给模型的工具（模型侧名为 `reproduce_<name>`）：

```ts
// 启动一条复现流水线（异步，立即返回 run_id）
reproduce_start(input: {
  paper_url: string
  repo_url: string
  env_strategy?: "docker" | "venv" | "auto"   // 默认 auto：有 docker 用 docker
}): { run_id: string }

// 查询流水线状态（供 agent 轮询与前端 handler 复用同一实现）
reproduce_status(input: { run_id: string }): {
  run: ReproduceRun
  steps: ReproduceStep[]              // 含每步 status/log_path/output_json
}

// 逐步推进：Skill 按步骤调用，agent 在步骤间做代码理解
reproduce_run_step(input: {
  run_id: string
  step: "clone" | "analyze" | "env_detect" | "env_generate" | "run" | "compare"
}): { status: string; output: unknown; log_tail: string }

// 论文指标抽取结果写入（由 agent 读论文后调用，人/模型确认过的值才入库）
reproduce_submit_paper_metrics(input: {
  run_id: string
  metrics: { model: string; dataset: string; metric: string; value: number }[]
}): { ok: true }

// 获取比对卡
reproduce_comparison(input: { run_id: string }): {
  metrics: ReproduceMetric[]          // 含 verdict 与差异百分比
}

// 获取/触发诊断报告
reproduce_diagnose(input: { run_id: string }): {
  issues: ReproduceIssue[]            // 按 version/dependency/parameter/data 分组
  report_path: string                 // report.md
}

// 取消运行中的流水线
reproduce_cancel(input: { run_id: string }): { ok: true }
```

实现要点：

- `reproduce_start` 只做入库（`pending`）并返回，不阻塞；真正的执行由 `reproduce_run_step` 逐步驱动——这让 Skill 编排的 agent 能在两步之间插入自己的代码理解与修复动作，符合"编排原生能力"的定位。
- `run` 步骤用 `Bun.spawn` 起 `docker run --rm --gpus all -v <run_dir>:/work image cmd`（或 venv 的 `python`），stdout/stderr 流式写入 `logs/run.stdout.log`，默认超时 4 小时可配；进程句柄存内存 Map，`reproduce_cancel` 负责 kill。
- `compare` 步骤从 `artifacts/` 中按约定文件名（`metrics.json`、`results.json`、`*_metrics.csv`）读取复现值，与 `reproduce_metric` 表中的 paper_value 按 `(model, dataset, metric)` 对齐，计算 `verdict`：相对误差 `abs(a-b)/abs(a) <= tolerance` 记 `match`。
- 所有步骤函数签名统一：`execute(ctx: StepContext): Promise<StepOutput>`，`StepContext` 携带 `run_id`、`workdir`、`store`、`log`（写日志文件 + 返回 tail）。

### 6.3 流水线状态机（伪代码）

```
pipeline.advance(run_id, step):
  run = store.getRun(run_id)
  assert run.status in (pending, running, failed)   # failed 允许从失败步重试
  store.updateStep(run_id, step, status=running, started_at=now)
  try:
    output = steps[step].execute(ctx)
    store.updateStep(run_id, step, status=completed, output_json=output)
    if step == "compare": store.updateRun(run_id, status=completed)
    else: store.updateRun(run_id, current_step=seq(step))
  catch e:
    store.updateStep(run_id, step, status=failed)
    store.updateRun(run_id, status=failed, error=e.message)
    issues = diagnose.classify(run_id, e, log_tail)   # 立即出初步诊断
    store.insertIssues(run_id, issues)
  return store.status(run_id)
```

### 6.4 诊断规则引擎（`diagnose.ts`）

诊断分两层：**规则层**（确定性，先行）+ **agent 层**（SubAgent 深读日志与代码，补充）。规则层对日志 tail 与 env-report 做模式匹配：

| 类别 | 典型信号（正则/条件） | 建议动作 |
| --- | --- | --- |
| version | `CUDA error: no kernel image`、`torch.* is not available`、Python minor 版本与 README 声明不符 | 锁定 README/论文声明版本重新生成环境 |
| dependency | `ModuleNotFoundError`、`ImportError`、pip 解析冲突（`ResolutionImpossible`） | 补装/降级，写 `requirements.lock` |
| parameter | 产物指标存在但 mismatch 且日志含默认 seed/lr 警告、config 文件缺 key | 生成参数对齐 patch |
| data | `FileNotFoundError` 指向数据集路径、`download` 类脚本未执行、校验和失败 | 提示数据集获取步骤，生成 preprocess 命令 |

每条规则命中产出一条 `reproduce_issue`，`evidence` 截取日志上下文 5 行；规则层未覆盖的交给 SubAgent 分析（见下节），SubAgent 产出的 issue 经同一 MCP 工具面入库（`reproduce_submit_issues`，签名同 `reproduce_submit_paper_metrics`，从略）。

### 6.5 server handler 与 protocol

`packages/protocol/src/groups/reproduce.ts` 定义 `ReproduceApi` HttpApiGroup（`listRuns / getRun / getComparison / getIssues / createRun / cancelRun`），在 `packages/api.ts` 注册；`packages/server/src/handlers/reproduce.ts` 的 handler 直接 `yield*` 调用 `@researchos/reproduce` 的 store 与 pipeline（server 侧允许依赖该包，不违反 Client 依赖方向）。之后 `packages/client` 执行 `bun run generate` 重新生成客户端，前端走 generated client 查询，不直连 SQLite。

## 7. SubAgent 与 Skill 定义

### 7.1 Skill：`.opencode/skill/reproduce.paper/SKILL.md`

```markdown
---
name: reproduce.paper
description: 论文代码复现编排。输入论文 URL 与 GitHub 仓库 URL，编排 Clone → 代码分析 → 环境检测 → 环境生成 → 运行实验 → 结果比对六步流水线，产出结果比对卡与复现诊断报告。
---

# reproduce.paper

你正在编排一条论文复现流水线。所有确定性步骤通过 `reproduce_*` MCP 工具执行；
你的职责是步骤之间的**代码理解、判断与修复**，以及论文报告指标的提取。

## 输入

- `paper_url`: 论文地址（arXiv / 会议页 / PDF 链接）
- `repo_url`: GitHub 仓库地址
- 可选 `env_strategy`: docker | venv | auto（默认 auto）

## 流程

1. 调用 `reproduce_start` 创建 run，记住 `run_id`。
2. **Clone**：调用 `reproduce_run_step(step=clone)`。
3. **代码分析**：调用 `reproduce_run_step(step=analyze)` 得到入口脚本与依赖声明清单；
   然后用你自己的文件读取/Grep 能力通读 README 与入口脚本，确认论文声明的实验命令
   （模型、数据集、配置），必要时修正 analyze 的猜测。
4. **论文指标提取**：阅读论文（URL 可访问则直接读；否则读摘要页），提取
   （model, dataset, metric, value）四元组，调用 `reproduce_submit_paper_metrics` 写入。
   只写你在文中明确看到的数值，不要编造。
5. **环境检测与生成**：依次调用 `env_detect`、`env_generate`。
   若 `env_generate` 失败，阅读 log_tail，判断属于 version 还是 dependency 问题，
   给出修复建议后重试一次；仍失败则停止并转诊断。
6. **运行**：调用 `reproduce_run_step(step=run)`。运行失败时阅读 log_tail：
   - 能用确定性手段修复（缺依赖、路径、明显配置错误）→ 修复后重跑一次（最多 2 次重试）。
   - 不能确定 → 不要反复试，转诊断。
7. **比对**：调用 `reproduce_run_step(step=compare)` 与 `reproduce_comparison`。
8. **诊断**：调用 `reproduce_diagnose` 获取四类问题清单；若规则层结论不充分，
   启动 reproduce SubAgent 深入分析日志与代码，把它的发现补充进报告。
9. 用中文向用户总结：复现状态、比对结果（match/mismatch 各多少）、最关键的 blocker
   与下一步建议。所有结论必须能在日志或入库数据中找到依据。

## 约束

- 绝不修改 `runs/<run_id>/repo/` 之外的文件；建议补丁一律写到 `patches/` 并说明，不静默应用。
- 每个数值结论标注来源（论文页/节 或 产物文件路径）。
- 任何一步失败都不要伪造成功状态，如实上报。
```

### 7.2 SubAgent：`.opencode/agent/reproduce.md`

```markdown
---
description: 复现诊断专家。分析复现失败的日志、环境与代码，归类为版本/依赖/参数/数据四类问题并给出可执行的修复建议。
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git *": allow
    "cat *": allow
---

你是论文复现诊断专家。你会收到一个 run_id 与失败现象。

工作方法：
1. 用 `reproduce_status` 与 `reproduce_diagnose` 拉取当前状态与规则层初步结论。
2. 阅读 `.researchos/reproduce/runs/<run_id>/` 下的日志、env-report.json 与 repo 代码，
   按 version / dependency / parameter / data 四类逐项排查，为每条问题给出：
   标题、严重级别（blocker/warning/info）、证据（日志片段或 文件:行号）、修复建议。
3. 若修复是确定性的代码/配置改动，生成 unified diff 写入
   `.researchos/reproduce/runs/<run_id>/patches/`，并在回复中说明——不要直接改 repo。
4. 通过 `reproduce_submit_issues` 把发现入库。

原则：每条结论必须有证据；无法归类的问题单独列为 info，不强行分类；
不确定时明确说"证据不足"，而不是猜测。
```

SubAgent 以 `edit: deny` 限制其只能产出 patch 文件（bash 写入 patches 目录经 `ask` 确认），保证诊断与执行分离。

## 8. 前端界面落地

对应 UI 设计 3.8。路由 `/reproduce` 与 `/reproduce/$runId`，注册进 `packages/app/src/app.tsx` 的 `Routes()`，侧栏 icon rail（`packages/app/src/pages/layout/sidebar-shell.tsx`）加 `⌥ 代码复现` 入口。

```
packages/app/src/pages/reproduce/
├── reproduce.tsx          # 列表页：历史 run 表格 + 新建复现表单
├── reproduce-run.tsx      # 详情页：三区块组合（下方组件）
├── components/
│   ├── new-run-form.tsx   # 论文 URL + Repo URL 输入 + env_strategy 选择
│   ├── pipeline-stepper.tsx   # 六步步骤条，每步可展开日志（轮询 getRun）
│   ├── comparison-card.tsx    # 论文值 vs 复现值并排表格，差异高亮
│   ├── issue-list.tsx         # 四类问题分组清单（version/dependency/parameter/data）
│   └── repo-panel.tsx         # Repo 智能面板：文件树 + 符号搜索 + 诊断摘要
```

落地要点：

- **pipeline-stepper**：横向六节点步骤条，节点颜色用语义令牌——进行中 `bg-surface-warning` 脉冲、成功用成功绿（`#7fd88f` 对应令牌）、失败用错误红；点击节点展开下方日志区（mono 字体，`log_tail` 增量轮询，间隔 2s，`run.status` 终态后停止）。组件自研，约 150 行，不引第三方 stepper 库。
- **comparison-card**：表格列 `模型 | 数据集 | 指标 | 论文值 | 复现值 | 差异% | 结论`；`match` 行左侧绿条、`mismatch` 行红条并高亮差异百分比、`missing_*` 行灰显。数据来自 generated client 的 `getComparison`。
- **issue-list**：四个可折叠分组（版本/依赖/参数/数据），组标题带计数徽标；每条 issue 卡片显示 severity 图标、证据片段（代码块）、`patch_path` 存在时显示"查看建议补丁"按钮（点击在 OpenCode 原生 diff review 中打开）。
- **repo-panel**：复用 app 现有的文件树组件（会话页同款，从 `packages/app/src/components` 引入，具体名以现有导出为准），根目录指向 run 的 repo 克隆路径；顶部符号搜索框走原生 repo 理解能力；底部嵌入该 run 的诊断报告 `report.md` 渲染（复用现有 markdown 渲染组件）。
- 数据源全部走 `@opencode-ai/client` generated client（6.5 节），不新增 REST 之外的通道；主题类名消费 `@opencode-ai/ui` 令牌（`bg-background-base`、`text-text-base` 等），不硬编码色值。
- Agent Dock 进入本页时上下文携带 `run_id`，用户可直接追问"为什么无法复现"——主 agent 经 Skill/SubAgent 读取同一 run 数据回答。

## 9. 开发步骤与里程碑

依赖：`packages/researchos-reproduce` 包骨架（W1 任务 1）是后续一切的前置；前端（W4）依赖 protocol/client 生成（W3）；SubAgent/Skill 联调（W5）依赖 MCP server（W2）。

**W1 — 包骨架与存储层**
1. 创建 `packages/researchos-reproduce`（package.json `@researchos/reproduce`、tsconfig 继承仓库基座）。
2. 实现 `store.ts`：DDL 迁移 + CRUD（`bun:sqlite`）。
3. 实现 `steps/clone.ts` 与 `steps/analyze.ts`（依赖声明解析：requirements/pyproject/environment.yml）。
4. `store.test.ts`、`env-detect` 解析器单测。

**W2 — 流水线核心与 MCP server**
5. 实现 `env-detect.ts`（汇总 analyze 结果 + 本机 nvidia-smi/python 探测 → env-report.json）。
6. 实现 `env-generate.ts`（Dockerfile.reproduce 模板渲染 + `docker build`；venv 回退分支）。
7. 实现 `run.ts`（Bun.spawn、日志落盘、超时、cancel）。
8. 实现 `mcp.ts`，`opencode.json` 注册，手动验证 `reproduce_start/status/run_step` 可被 agent 调用。

**W3 — 比对、诊断与服务端接口**
9. 实现 `compare.ts`（指标对齐与 verdict）+ `diagnose.ts` 规则层。
10. 新增 `packages/protocol/src/groups/reproduce.ts`，注册进 `api.ts`；写 `packages/server/src/handlers/reproduce.ts`。
11. `packages/client` 跑 `bun run generate`，确认 generated 客户端包含 ReproduceApi。

**W4 — 前端页面**
12. `reproduce.tsx` 列表页 + `new-run-form.tsx`。
13. `reproduce-run.tsx` + `pipeline-stepper.tsx` + `comparison-card.tsx`。
14. `issue-list.tsx` + `repo-panel.tsx`；侧栏入口与路由注册。

**W5 — Skill/SubAgent 与端到端联调**
15. 落地 `.opencode/skill/reproduce.paper/SKILL.md` 与 `.opencode/agent/reproduce.md`。
16. 端到端联调：选 1 个小型真实论文仓库（如经典 CV 小模型）跑通六步。
17. 补诊断规则、修联调问题、写 README（包级使用说明）。

里程碑可演示成果：W2 末"MCP 工具跑通 clone→run"，W3 末"比对卡数据可经 HTTP 查询"，W5 末"论文 URL + Repo URL 一键复现并出诊断报告"。

## 10. 测试方案

遵守仓库规则：**不在 repo 根目录跑测试**，一律在 `packages/researchos-reproduce` 目录下执行 `bun test` 与 `bun typecheck`。

- **单测**（`packages/researchos-reproduce/test/`）：
  - `store.test.ts`：DDL 幂等迁移、run/step/metric/issue 的写入与查询、step 的 `UNIQUE(run_id, seq)` 约束。用临时目录建库，不用 mock。
  - `env-detect.test.ts`：对 `test/fixtures/` 下的真实样例文件（多种 requirements.txt、environment.yml、pyproject.toml）断言解析出的 Python 版本与依赖清单。
  - `compare.test.ts`：构造 paper/repro 指标对，断言 match/mismatch/missing_* 判定与容差边界（恰好等于 tolerance 应判 match）。
  - `diagnose.test.ts`：对预置日志片段（`ModuleNotFoundError`、CUDA 版本错等）断言归类到正确 category。
- **集成测试**（`test/integration.test.ts`，默认跳过，设 `REPRODUCE_INTEGRATION=1` 才跑）：用 `test/fixtures/mini-repo/`（一个 30 行 Python 打印 metrics.json 的假仓库，本地 `file://` 克隆）走完整六步，断言最终 `status=completed` 且比对卡产生一条 match。Docker 相关用例检测 `docker info` 可用性，不可用则只测 venv 分支。
- **server handler 测试**：放 `packages/server` 既有测试目录（跟随该包现有测试约定），handler 直接调真实 store（临时 db 路径注入），不起 HTTP 服务。
- **前端**：组件以类型检查（`bun typecheck`，在 `packages/app` 下）与手动验证为主；比对卡 verdict 着色的纯函数（差异百分比与 verdict 计算）抽到 `@researchos/reproduce` 内并单测，前端不做重复逻辑。
- Skill/SubAgent 不写自动化测试，以 W5 的端到端联调记录为准。

## 11. 风险与开放问题

1. **Docker 可用性**：Windows 上 Docker Desktop 未必安装/运行。缓解：`env_strategy=auto` 探测失败自动回退 venv；前端在 env_generate 步骤显式展示所用策略。开放问题：是否支持 devcontainer 复用仓库自带 `.devcontainer/`？首版不做，列入后续。
2. **GPU 实验不可复现性**：无 GPU 机器跑深度学习仓库必然失败。缓解：env_detect 提前检测并在前端预警"该仓库声明需要 CUDA x.y，本机无 GPU"；开放问题：是否允许"缩小规模复现"（小数据集/少 epoch）作为显式选项——倾向做，但需 Skill 明确标注"非原配置，数值不可比"。
3. **论文指标提取准确率**：LLM 从 PDF/网页抽指标可能错配（model/dataset 行错位）。缓解：`reproduce_submit_paper_metrics` 要求 agent 附来源，比对卡展示来源注记；开放问题：是否需要人工确认 UI 再入库——首版由 agent 自证来源，后续加确认交互。
4. **长任务与进程生命周期**：docker run 数小时，MCP server 进程被重启会丢内存中的进程句柄。缓解：`run` 步骤启动时把 pid/容器名写入 step 的 `output_json`，重启后 `reproduce_status` 可按容器名恢复追踪；完全断点续跑（容器内状态）不做。
5. **写锁竞争**：MCP server 与 server handler 若分进程同时写 `reproduce.db`。缓解：WAL + 单写者约定（仅 MCP server 写，handler 只读 + 经 MCP 发起动作）；若后续合并进程则共享连接。
6. **依赖上游 OpenCode 的 repo 理解接口形态**：前端 repo-panel 复用会话页文件树组件，其导出形态以 `packages/app` 现状为准；若该组件未导出需小改 app 包导出（属 Fork 内 UI 层改动，不碰核心）。
7. **范围蔓延**：自动修复 patch 的"一键应用并重跑"闭环诱人但风险高。首版只出 patch + diff review，是否自动重跑留给用户，待有真实使用反馈后再评估。
