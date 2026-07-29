# ResearchOS AI Coding 开发计划

> **目标受众：所有参与开发的 Coding Agent（Claude、GPT、Gemini 等），非人类工程师。**
> 本文定义了可被机器解析的开发阶段、模块依赖、文件路径约定和验证标准。
> 配套约束文件：`docs/coding-agent-convention.md`、`docs/dependency-inventory.md`。

---

## 零、前置：读取约束文件

每个 Coding Agent 在开始任何编码工作前，**必须先读取以下 3 个文件**：

| 序号 | 文件 | 用途 |
|---|---|---|
| 0 | `AGENTS.md`（仓库根） | OpenCode 上游代码风格、分支/提交规范 |
| 1 | `docs/coding-agent-convention.md` | ResearchOS 编码公约 + 工作纪要规则 |
| 2 | `docs/dependency-inventory.md` | 可用依赖清单（新增依赖必须先查此表） |

---

## 一、项目架构速览（Agent 必读）

### 1.1 仓库身份

- 本项目是 `github.com/anomalyco/opencode` 的 **fork**
- 默认分支：`dev`（`main` 可能不存在）
- diff 一律对 `dev` 或 `origin/dev`
- 上游镜像分支 `upstream-dev`：只 fast-forward，**禁止直接提交**

### 1.2 依赖方向（不可逆）

```
Schema  →  Core  →  Server
  ↓         ↓
Protocol ←──┘
  ↓
Client（永不依赖 Core/Server）
  ↓
@researchos/*（全部处于此层，永不依赖 Core/Server）
```

- `@researchos/*` → 只能依赖 `@opencode-ai/schema`、`@opencode-ai/protocol`、`@opencode-ai/client` + 三方库
- Server handler 是**唯一**能同时 import `@researchos/*` 与 server 设施的层

### 1.3 目录结构约定

```
packages/
├── researchos-literature/      # @researchos/literature — TS 库
├── researchos-graph/           # @researchos/graph — TS 库
├── researchos-latex/           # @researchos/latex — TS 库
├── researchos-data/            # @researchos/data — TS 库
├── researchos-writing/         # @researchos/writing — plugin 包
├── researchos-reproduce/       # @researchos/reproduce — TS 库
├── researchos-plot-core/       # @researchos/plot-core — plugin 包
├── researchos-mcp/             # Python FastMCP servers
│   ├── literature/             #   uv 管理，独立 venv
│   ├── data/                   #   uv 管理，独立 venv
│   └── plot/                   #   uv 管理，独立 venv
├── researchos-preset/          # @researchos/preset
│   ├── agent/*.md              #   SubAgent 定义
│   ├── skill/*/SKILL.md        #   Skill 定义
│   ├── command/*.md            #   slash 命令
│   └── opencode.researchos.json  # MCP/plugin/agent 预设
├── app/                        # SolidJS SPA（侵入点集中在此）
├── protocol/                   # HttpApi 契约（侵入点 #1-#2）
├── server/                     # handler 实现（侵入点 #3）
└── client/                     # 生成的 SDK（不可手改 src/generated*）
```

### 1.4 能力形态决策速查

| 能力性质 | 落地形态 | 位置 |
|---|---|---|
| 文献/图谱/LaTeX/复现内核（TS 逻辑） | 新 npm 包 `@researchos/*` | `packages/researchos-*` |
| 数据分析/统计绘图（重 Python 依赖） | Python FastMCP server | `packages/researchos-mcp/*` |
| 轻量确定性工具（格式转换、校验） | OpenCode plugin tool | `packages/researchos-writing`、`researchos-plot-core` |
| 科研 SubAgent | markdown agent 文件 | `researchos-preset/agent/*.md` |
| 领域知识 Skill | SKILL.md | `researchos-preset/skill/*/SKILL.md` |
| Agent 可调用的工具面 | MCP server 声明 | 课题 `opencode.json` 的 `mcp` 键 |
| 前端持久化数据通道 | protocol group + server handler | `protocol/` + `server/`（侵入点） |
| 前端页面 | SolidJS SPA 页面 | `packages/app/src/pages/` |

### 1.5 受控侵入点清单（禁止触碰其他上游文件）

| # | 侵入点 | 内容 | 合并策略 |
|---|---|---|---|
| 1 | `packages/protocol/src/api.ts` | `makeApiFromGroup(...)` 追加一行 | 单行追加 |
| 2 | `packages/protocol/src/groups/researchos-*.ts` | **新增文件**（6 个 group） | 纯新增 |
| 3 | `packages/server/src/handlers/researchos-*.ts` + `api.ts` | 新增 handler + `api.ts` 单行注册 | handler 新增；api.ts 单行追加 |
| 4 | `packages/app/src/app.tsx` | `Routes()` 追加 ResearchOS 路由 | `researchos:start/end` 标记包裹 |
| 5 | `packages/app/src/pages/layout/sidebar-shell.tsx` | icon rail 追加模块入口 | 同上标记 |
| 6 | `packages/app/src/pages/session/composer/prompt-input-v2.tsx` | 资产快捷条 + `@` 提及扩展 | 标记包裹，优先 provider 注册 |
| 7 | `packages/desktop`（electron-builder） | Tectonic 等二进制 `extraResources` | 标记包裹 |
| — | **所有其他上游文件** | **禁止修改** | — |

### 1.6 禁止改动区

- `packages/core`、`packages/server` 的 Agent 调度/Session/权限内核
- `packages/opencode` 的 tool registry/agent 运行时/MCP 运行时
- `packages/tui`、`packages/cli`
- `packages/client/src/generated*`
- `patches/` 下既有补丁（**我们不新增 patch**）

---

## 二、开发阶段划分（按依赖关系排序）

### Phase 0: 底座就绪（P0）

> **目标**：基础设施与资产管理中心就绪，后续所有模块的依赖底座。

#### P0.1 — 资产管理中心基础设施（模块八）

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P0.1.1 | `packages/protocol/src/groups/researchos-assets.ts` — 定义 asset CRUD group | 契约文件 | `bun typecheck` through `packages/protocol` |
| P0.1.2 | `packages/server/src/handlers/researchos-assets.ts` — handler 实现 | handler | — |
| P0.1.3 | `packages/protocol/src/api.ts` 追加 asset group（侵入点 #1） | 追加一行 | — |
| P0.1.4 | `packages/server/src/api.ts` 注册 handler（侵入点 #3） | 追加一行 | — |
| P0.1.5 | `cd packages/client && bun run generate` | 生成 SDK | `check:generated` 干净 |
| P0.1.6 | `packages/researchos-preset/` 目录骨架建立 | preset 包 | `bun typecheck` |
| P0.1.7 | `packages/app/src/app.tsx` 追加 `/:dir/assets` 路由（侵入点 #4） | 路由 | app 编译通过 |
| P0.1.8 | `packages/app/src/pages/assets/` — 资产管理页面 | 前端页面 | `bun typecheck` + storybook |

**依赖**：无前置模块，本阶段自身是底座。
**交付标准**：资产管理页面可打开，左侧导航可见 7 类资产（Skill/MCP/Model/SubAgent/Command/Rules/Hook），右侧可查看列表（只读）。

#### P0.2 — API Hub 基础设施（模块九）

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P0.2.1 | `packages/researchos-api-hub/` — 新包：registry + adapter + 限流 | `@researchos/api-hub` | `bun typecheck && bun test` |
| P0.2.2 | 在 asset 页面新增「API 面板」 | API Hub UI | app 编译通过 |

**依赖**：P0.1（资产管理中心页面）。
**交付标准**：API 面板展示科研 API 列表与状态点。

---

### Phase 1: 文献管理中心（P1）

> **目标**：文献库内核 + MCP server + 三栏前端页面。这是其他所有模块的数据源。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P1.1 | `packages/researchos-literature/` — 新包 | `@researchos/literature` | `bun typecheck && bun test` |
| P1.2 | protocol group `researchos-literature.ts` + handler + api.ts 追加 + client generate | 数据通道 | `check:generated` |
| P1.3 | `packages/researchos-mcp/literature/` — Python FastMCP server | MCP server | `uv run pytest` |
| P1.4 | `researchos-preset/agent/literature.md` — Literature SubAgent | SubAgent | 加载验证 |
| P1.5 | `researchos-preset/skill/paper-reading/SKILL.md` — 论文阅读 Skill | Skill | frontmatter 验证 |
| P1.6 | `packages/app/src/app.tsx` 追加 `/:dir/literature`（侵入点 #4） | 路由 | — |
| P1.7 | `packages/app/src/pages/literature/` — 三栏页面 | 前端 | `bun typecheck` |

**依赖**：P0.1（资产中心）、P0.2（API Hub，用于四源 API 封装）。
**交付标准**：可检索 arXiv/SS/Crossref/PubMed、导入 Zotero、查看 PDF 元数据、导出 BibTeX。

---

### Phase 2: 知识图谱（P2）

> **目标**：图谱内核 + MCP server + 全屏画布 + Graph RAG。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P2.1 | `packages/researchos-graph/` — 新包 | `@researchos/graph` | `bun typecheck && bun test` |
| P2.2 | protocol + handler + client generate | 数据通道 | — |
| P2.3 | `researchos-preset/agent/graph.md` — Knowledge Graph SubAgent | SubAgent | — |
| P2.4 | `researchos-preset/skill/graph-rag/SKILL.md` | Skill | — |
| P2.5 | `packages/app/src/app.tsx` 追加 `/:dir/graph` | 路由 | — |
| P2.6 | `packages/app/src/pages/graph/` — 全屏画布 | 前端 | `bun typecheck` |

**依赖**：P1（文献库，节点数据源）。
**交付标准**：解析 `[[]]` 双链 + `\cite{}`、力导向图、节点详情、Graph RAG 提问。

---

### Phase 3: LaTeX 编辑器 + 论文写作助手（P3）

> **目标**：分支 `latex-editor` + `paper-writing` 两个子模块协同交付。两者共用一个前端页面 `/:dir/latex`（编辑器主区 + 写作助手侧栏）。
>
> **进度（2026-07-29）**：P3 主链完成。LaTeX 文件/PDF/构建历史数据通道、Monaco + PDF.js + SyncTeX + diagnostics、五标签写作侧栏、真实 deterministic writing HTTP、`latex-editor` agent 及标题/结构/引用三个 Skill 均已交付并通过相关测试、类型检查与生产构建。Tectonic 二进制随 Desktop 分发仍归 P6.5。

#### P3.1 — LaTeX 编辑器（模块三）

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P3a.1 | `packages/researchos-latex/` — 新包 | `@researchos/latex` | `bun typecheck && bun test` |
| P3a.2 | protocol + handler + client generate | 数据通道 | — |
| P3a.3 | `researchos-preset/skill/latex-troubleshoot/SKILL.md` | Skill | — |
| P3a.3b | `researchos-preset/agent/latex-editor.md` | SubAgent | preset JSON 解析 |
| P3a.4 | `packages/app/src/app.tsx` 追加 `/:dir/latex` | 路由 | — |
| P3a.5 | `packages/app/src/pages/latex/` — Monaco + PDF 预览 + 编译日志 | 前端 | `bun typecheck` |

#### P3.2 — 论文写作助手（模块五）

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P3b.1 | `packages/researchos-writing/` — plugin 包 | `@researchos/writing` | `bun typecheck && bun test` |
| P3b.2 | `researchos-preset/agent/paper-writer.md` — Paper Writing SubAgent | SubAgent | — |
| P3b.3 | `researchos-preset/skill/academic-polish/SKILL.md` | Skill | — |
| P3b.4 | `researchos-preset/skill/algo2e/SKILL.md` | Skill | — |
| P3b.4b | `paper-titles` / `paper-structure` / `cite-assist` | Skills | frontmatter 校验 |
| P3b.5 | 写作助手侧栏标签页组件（挂载到 LaTeX 页面内） | 前端 | `bun typecheck` |

**依赖**：P1（文献库，引用助手数据源）。
**交付标准**：Tectonic 编译 PDF 预览、SyncTeX 跳转、标题/结构/润色/AI 修改 diff review。

---

### Phase 4: 数据分析 + 科研绘图 + 复现（P4）

> **目标**：三个模块共享 Python 沙盒与产物库，可并行开发但前端互不阻塞。

#### P4.1 — 数据分析中心（模块四）

> **进度（2026-07-29）**：P4.1 v1 完成。Notebook cells/run、MCP/HTTP 共用 kernel broker、单元格流、数据/检验/产物面板与实验关联已通过 TS/Python 测试、Client 契约校验和 App 生产构建。课题独立 venv 与 Jupyter/Optuna 保留为 v2，不阻塞当前清单。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P4a.1 | `packages/researchos-data/` — TS 包（产物库/SQLite） | `@researchos/data` | `bun typecheck && bun test` |
| P4a.2 | `packages/researchos-mcp/data/` — Python FastMCP（沙盒 + 5 工具） | MCP server | `uv run pytest` |
| P4a.3 | protocol + handler + client generate | 数据通道 | — |
| P4a.4 | `researchos-preset/agent/data-analyst.md` | SubAgent | — |
| P4a.5 | `packages/app/src/app.tsx` 追加 `/:dir/data` | 路由 | — |
| P4a.6 | `packages/app/src/pages/data/` — Notebook 单元格流 | 前端 | `bun typecheck` |

#### P4.2 — 科研绘图中心（模块七）

> **进度（2026-07-29）**：P4.2 v1 完成。四模式 Plot Studio 已连接真实 Python/WASM/浏览器渲染链，draw.io 编辑结果可原子保存，产物图库可追踪论文引用；Protocol/Client、单测、类型检查与生产构建均已验收。离线自托管 draw.io 与 PlantUML 保留为增强项。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P4b.1 | `packages/researchos-plot-core/` — plugin 包（spec/主题/TikZ 桥接） | `@researchos/plot-core` | `bun typecheck && bun test` |
| P4b.2 | `packages/researchos-mcp/plot/` — Python FastMCP（3 工具） | MCP server | `uv run pytest` |
| P4b.3 | protocol + handler + client generate | 数据通道 | — |
| P4b.4 | `researchos-preset/agent/plot.md` + `researchos-preset/skill/scientific-plot/SKILL.md` | SubAgent + Skill | — |
| P4b.5 | `packages/app/src/app.tsx` 追加 `/:dir/plot` | 路由 | — |
| P4b.6 | `packages/app/src/pages/plot/` — 四模式绘图工坊 | 前端 | `bun typecheck` |

#### P4.3 — 代码复现中心（模块六）

> **进度（2026-07-29）**：P4.3 v1 完成。硬编码 stub 与前端假进度已替换为 SQLite 六步状态机、显式实验命令、真实 Git/Python 集成链、指标比对、规则诊断、HTTP/Client、MCP、SubAgent/Skill 和历史 run 工作台。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P4c.1 | `packages/researchos-reproduce/` — 新包 | `@researchos/reproduce` | `bun typecheck && bun test` |
| P4c.2 | protocol + handler + client generate | 数据通道 | — |
| P4c.3 | `researchos-preset/agent/reproduce-doctor.md` + `researchos-preset/skill/reproduce-paper/SKILL.md` | SubAgent + Skill | — |
| P4c.4 | `packages/app/src/app.tsx` 追加 `/:dir/reproduce` | 路由 | — |
| P4c.5 | `packages/app/src/pages/reproduce/` — 流水线 + 比对卡 | 前端 | `bun typecheck` |

**依赖**：P3.1（Python 沙盒共享）、P1（文献提取论文指标）。
**交付标准**：六步复现流水线、结果比对卡、四类诊断报告。

---

### Phase 5: 全文翻译中心（模块十）

> **进度（2026-07-29）**：P5 v1 完成。已移除 TS/Python/前端全部翻译 stub，交付 PyMuPDF 提取、配置型真实翻译引擎、保真掩码、四类归档产物、HTTP/Client、Translator SubAgent 和双语阅读工作区。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P5.1 | `packages/researchos-translate/` — TS 包（编排/术语库/SQLite） | `@researchos/translate` | `bun typecheck && bun test` |
| P5.2 | `packages/researchos-mcp/translate/` — Python FastMCP（PyMuPDF 提取） | MCP server | `uv run pytest` |
| P5.3 | protocol + handler + client generate | 数据通道 | — |
| P5.4 | `researchos-preset/agent/translator.md` | SubAgent | — |
| P5.5 | 文献详情页翻译入口 + 双语对照视图（追加到 P1.7 页面） | 前端增强 | `bun typecheck` |

**依赖**：P0.2（API Hub，LibreTranslate/DeepL adapter）、P1（文献库 PDF 源）。
**交付标准**：PDF 提取 → API 初译 → LLM 润色 → `translation_zh.md`。

---

### Phase 6: Dashboard + 侧栏 + Desktop 适配（整合阶段）

> **进度（2026-07-29）**：P6 v1 完成。Dashboard 已改为真实模块计数，九入口 rail 与会话 Research assets 快捷条已接入；Desktop 可打包平台 Tectonic 资源并注入 sidecar。App 与 Desktop renderer/main/preload 生产构建通过。

| 步骤 | 工作内容 | 产出 | 验证 |
|---|---|---|---|
| P6.1 | `packages/app/src/app.tsx` 追加 `/:dir/overview` | 总览路由 | — |
| P6.2 | `packages/app/src/pages/overview/` — 课题驾驶舱 | 前端 | `bun typecheck` |
| P6.3 | `packages/app/src/pages/layout/sidebar-shell.tsx` 追加 icon rail（侵入点 #5） | 导航 | app 编译通过 |
| P6.4 | `packages/app/src/pages/session/composer/` 追加资产快捷条 + `@` 提及扩展（侵入点 #6） | 增强 | app 编译通过 |
| P6.5 | `packages/desktop` Tectonic 二进制分发（侵入点 #7） | Desktop 适配 | electron-builder 构建通过 |

---

## 三、模块依赖图（并行机会标注）

```
P0.1(资产中心) ──────────────────────────────────────────────────────┐
  └─ P0.2(API Hub)                                                    │
       └─ P1(文献中心) ──────────────────────────────────────────────┤
            ├─ P2(知识图谱)                                            │
            ├─ P3.1(LaTeX) ──┬── P3.2(写作助手)                       │
            ├─ P4.1(数据) ───┼── P4.2(绘图) ── P4.3(复现) ← 可并行    │
            └─ P5(翻译)      │                                        │
                             │                                        │
            P6(Dashboard + 侧栏 + Desktop 整合) ←────────────────────┘
```

**可并行执行**：P4.1 + P4.2 + P4.3 无相互依赖（共享沙盒但接口独立）；P2 和 P3 之间无直接依赖（可同时开发）。

---

## 四、每模块验收 Checkpoint（Agent 自检）

在声明某个模块"完成"前，确认以下全部通过：

```
[ ] 智能层资产已创建：
    [ ] researchos-preset/agent/<name>.md（SubAgent）
    [ ] researchos-preset/skill/<name>/SKILL.md（Skill，如适用）
    [ ] researchos-preset/command/<name>.md（slash 命令，如适用）

[ ] 内核包通过检查：
    [ ] cd packages/researchos-<x> && bun typecheck（零错误）
    [ ] cd packages/researchos-<x> && bun test（全通过）

[ ] MCP server（如涉及 Python）通过检查：
    [ ] cd packages/researchos-mcp/<x> && uv run ruff check
    [ ] cd packages/researchos-mcp/<x> && uv run pytest

[ ] 数据通道已打通：
    [ ] protocol group 已创建（packages/protocol/src/groups/）
    [ ] server handler 已注册（packages/server/src/handlers/ + api.ts）
    [ ] client generate 已执行且 check:generated 干净

[ ] 前端页面可编译：
    [ ] cd packages/app && bun typecheck

[ ] 侵入点按规定标记：
    [ ] 所有上游文件改动用 /* researchos:start */ /* researchos:end */ 包裹
    [ ] 未触碰禁止改动区

[ ] 文档已同步：
    [ ] docs/modules/0X-<name>.md 已更新
    [ ] 如有新增依赖，已更新 docs/dependency-inventory.md
```

---

## 五、Agent 工作起手式（每次新会话必须做的事）

```yaml
# 1. 读取上下文
read: ["AGENTS.md", "docs/coding-agent-convention.md", "docs/dependency-inventory.md"]

# 2. 确定当前分支
run: "git branch --show-current"
assert: "分支名 ≤3 词，连字符分隔"

# 3. 确定修改范围
run: "git status --short"

# 4. 创建（或追加）工作纪要
# ⚠️ 见 coding-agent-convention.md §工作纪要——必须执行
create_or_append: ".sisyphus/sessions/YYYY-MM-DDTHHmmss-{agent}-{task}.md"

# 5. 开始工作
# 遵守开发规范.md + coding-agent-convention.md 全部规则
```

---

## 六、冲突热点与注意事项

1. **侵入点标记**：所有上游文件修改必须用 `/* researchos:start */` / `/* researchos:end */` 包裹。
2. **client generate**：protocol 或 server HttpApi 变更后，必须 `cd packages/client && bun run generate`。
3. **禁止根目录跑测试**：始终 `cd packages/<x> && bun test`。
4. **分支命名**：`<word1>-<word2>-<word3>`，无斜线、无类型前缀。
5. **提交格式**：`type(scope): summary`，type ∈ `feat|fix|docs|chore|refactor|test`。
6. **SQLite 路径**：统一 `{project}/.researchos/{module}.db`，在 `packages/researchos-*/src/paths.ts` 集中管理。
7. **P0.1 以外的模块**，在 P0.1 未完成前可以并行开始——P0.1 不需要阻塞内核包开发，只阻塞资产管理 UI。
