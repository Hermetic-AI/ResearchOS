# 模块三：本地 LaTeX 编辑器 —— 技术落地文档

> 交付状态（2026-07-29）：P3.1 主链已交付。除原有编译/SyncTeX/format_check 三工具外，新增受限源码列表、读取、原子保存、PDF 与构建历史 HTTP 通道；`latex_build` / `latex_format_issue` 已落 SQLite；Monaco、BibTeX cite key 补全、PDF.js、正反向 SyncTeX、诊断面板与最近构建恢复已接入 `/:dir/latex`；`latex-editor` SubAgent 已登记。Tectonic 未安装时仍返回明确不可用状态，不伪造 PDF。

> 对应总体方案：`docs/ResearchOS最终方案.md` 模块三 + 接口 5.3 节。
> 对应 UI 设计：`docs/ResearchOS-UI设计.md` 3.5 节（LaTeX 编辑器）、3.7 节（写作助手共生面板，接口归模块五，本模块仅预留面板挂载点）。

---

## 1. 模块概述与目标

为 ResearchOS 提供本地优先的 LaTeX 写作环境：基于 Monaco Editor 的 LaTeX 编辑器（语法高亮 / BibTeX 补全 / 章节大纲），以 Tectonic（Rust 单二进制、按需下载宏包）为编译引擎，实现 PDF 实时预览、SyncTeX 正反向跳转、`latex.format_check` 期刊模板合规校验与编译日志面板。目标是不依赖数 GB 的 TeX Live，让用户开箱即写、即编译、即预览，并让 Agent 能通过标准 MCP/Skill 接口驱动编译与校验闭环。

## 2. 功能清单与范围边界

**做（本模块范围内）：**

- Monaco 编辑器集成：LaTeX 语法高亮、`\cite{}` 的 BibTeX key 补全（数据源 = 项目内 `.bib` 文件解析）、`\section` 树状大纲与折叠、编译错误行内标记（marker + glyph margin）。
- Tectonic 编译：项目根自动探测 main file（含 `\documentclass`）、按需下载宏包（Tectonic 内建 bundle 机制）、增量触发（保存防抖 + 手动按钮）。
- PDF 预览：渲染编译产物 PDF，缩放/翻页；与编辑器分栏，比例可拖拽。
- SyncTeX：正向（编辑器光标 → PDF 位置高亮）、反向（PDF 点击 → 跳源码行）。
- `latex.format_check`：编译错误结构化定位 + 期刊模板（ieee/acm）合规规则检查。
- 编译日志面板：错误/警告计数徽标、可折叠日志流、点击日志条目跳转对应文件行号。
- 供 Agent 调用的三个 Skill 接口：`latex.compile` / `latex.synctex` / `latex.format_check`（契约见总体方案 5.3，本文实现签名见第 6 节）。

**不做（明确排除）：**

- 不做完整 LaTeX Language Server（如 TexLab）级别的语义分析、宏展开、跨文件补全——首期靠 Monaco Monarch 语法 + 自研轻量解析（正则/行扫描）覆盖高亮、补全、大纲即可；后续可作为独立增强项接入 TexLab LSP。
- 不做协作编辑（多人实时协同）、不做在线 LaTeX（Overleaf 式服务端编译队列）——编译始终在本机子进程。
- 不做期刊模板分发中心：`format_check` 只检查用户项目内已有模板的合规性，不托管 `.cls/.sty`。
- 写作助手的 AI 改写 / 引用推荐属模块五（Paper Writing SubAgent），本模块只暴露编辑器选区上下文与面板挂载点。
- 不引入 TeX Live / MiKTeX 作为可选引擎后端（接口 `engine` 字段保留，仅实现 `tectonic`）。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 编辑器内核 | Monaco Editor（`monaco-editor`，复用 app 已有依赖） | OpenCode 前端同源技术，自带 Monarch 高亮、marker、补全 API | MIT |
| LaTeX 语法高亮 | 自研 Monarch tokenizer（`latex` 语言定义）+ `bibtex` | 体量小、可控；不引第三方语言包 | MIT（自研） |
| 编译引擎 | Tectonic（Rust 单二进制，外部进程调用） | 按需下载宏包、跨平台单二进制、避免 TeX Live 数 GB 体积；内建 SyncTeX 输出 | MIT |
| SyncTeX 解析 | `synctex-parser` 逻辑自研（TS 解析 `.synctex.gz` 文本记录） | 协议简单（文本块格式），避免引原生绑定 | 自研（参考 SyncTeX 规范，zlib/gzip 用 Bun 内建） |
| BibTeX 解析 | 自研轻量解析（entry/type/key/fields） | `.bib` 语法简单，补全只需 key + title/author；不引重量级 CSL 库 | 自研 |
| PDF 渲染 | PDF.js（`pdfjs-dist`） | 事实标准的 Web PDF 渲染器，支持文本层坐标 → SyncTeX 反向跳转命中计算 | Apache-2.0 |
| 日志解析 | 自研（Tectonic stdout/stderr + `.log` 行扫描） | Tectonic 输出为结构化程度较高的行文本，正则即可提取 `file:line: message` | 自研 |
| MCP 封装 | `@modelcontextprotocol/sdk`（repo 已有） | OpenCode 原生 MCP 支持，Skill 统一协议 | MIT |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| `latex.compile` / `latex.synctex` / `latex.format_check` | **新 package `@researchos/latex`** 实现核心逻辑 + **MCP server**（`@researchos/latex` 暴露 `bun run` 入口，在 `opencode.json` 的 `mcp` 键声明 `{type:"local", command:["bun","run","packages/researchos-latex/src/mcp.ts"]}`） | 编译/SyncTeX/校验是给 Agent 调用的 Skill，按架构原则走 MCP 统一协议；核心逻辑收在独立包里便于单测与复用（前端经 server 调用、Agent 经 MCP 调用，同一份实现） |
| 编辑器内联能力（高亮、BibTeX 补全、大纲、错误 marker） | **app 前端页面代码**（`packages/app/src/pages/latex/`） | 纯 UI 层能力，与 Monaco 生命周期强耦合，无需经任何协议 |
| 编译触发（保存防抖自动编译）与日志面板数据 | **前端直接调用 OpenCode server**：在 `packages/protocol/src/groups/` 新增 `LatexGroup` HttpApiGroup（`compile`/`synctex`/`formatCheck`/`status`），handler 在 `packages/server/src/handlers/latex.ts`，内部复用 `@researchos/latex` 的核心函数 | 前端走 HTTP 比走 MCP 直；同时满足"不改 generated、跑 `bun run generate`"的既定流程 |
| Tectonic 二进制分发 | desktop 打包内置（`packages/desktop` 打包时按平台附带 `tectonic-<target>` 二进制）+ Web/CLI 首次运行下载（从 GitHub Releases 拉取对应平台资产，存入全局数据目录，校验 SHA256） | Desktop 用户开箱即用；Web/CLI 场景不能预设体积，首次 `latex.compile` 时惰性下载并在 UI 显示进度 |
| LaTeX 写作 SubAgent | **`.opencode/agent/latex-editor.md`** | Agent 侧编排能力（改错、补全引用、跑编译循环）用 SubAgent 声明即可，零代码 |
| 编译排错 Skill（提示词级操作手册） | **`.opencode/skill/latex-troubleshoot/SKILL.md`** | "编译失败怎么办"是流程性知识，Skill 文档形态最合适，供 SubAgent 与主 Agent 经 SkillTool 调用 |

依赖方向说明：`@researchos/latex` 只依赖 Node/Bun 标准能力与子进程调用，可被 Server 依赖；Client/前端不直接依赖它，只消费 protocol 生成的 client。符合"Client 不得依赖 Core/Server"约束。

## 5. 数据模型与本地存储设计

编译产物与索引全部落在项目工作区内，保证 Git 可忽略、可复现；构建历史入库便于日志面板展示历史编译记录。

### 文件目录约定（项目工作区内）

```
<workspace>/
├── paper/                        # 用户 LaTeX 源码（用户自定结构）
│   ├── main.tex
│   ├── refs.bib
│   └── sections/...
└── .researchos/
    └── latex/
        ├── build/                # Tectonic --outdir，加 .gitignore
        │   ├── main.pdf
        │   ├── main.synctex.gz
        │   └── main.log
        ├── cache/                # Tectonic bundle 缓存（--keep-logs 等）
        └── tectonic.toml         # 项目级配置：main_file、引擎、bundle url 覆盖
```

Tectonic 二进制本体不放项目内，放全局数据目录（desktop 内置时读安装目录资源；否则 `<global-data>/researchos/bin/tectonic-v<version>/<platform>/tectonic`）。

### SQLite 表（沿用 repo 的 drizzle snake_case 约定，建在项目级库）

```sql
-- 编译历史：日志面板"历史记录"标签与状态栏"上次编译 ✓/✗"
create table latex_build (
  id          text primary key,           -- uuid
  project_id  text not null,
  main_file   text not null,              -- 相对 workspace 路径
  engine      text not null default 'tectonic',
  status      text not null,              -- 'success' | 'error' | 'cancelled'
  error_count integer not null default 0,
  warn_count  integer not null default 0,
  log_path    text,                       -- 指向 .researchos/latex/build/*.log
  pdf_path    text,
  duration_ms integer,
  created_at  integer not null
);

-- format_check 结果快照：供 UI 持久展示 issue 列表
create table latex_format_issue (
  id          text primary key,
  build_id    text references latex_build(id),
  file        text not null,
  line        integer not null,
  rule        text not null,              -- 如 'missing-cite-key' / 'ieee-section-title-case'
  severity    text not null,              -- 'error' | 'warning' | 'info'
  message     text not null,
  created_at  integer not null
);
```

BibTeX 条目、大纲、SyncTeX 映射均为**易失索引**：由对应 `.bib`/`.tex`/`.synctex.gz` 文件实时解析，不入库、不缓存到磁盘（文件 watch 触发重新解析，内存缓存即可）。

## 6. 核心接口实现

### 6.1 `@researchos/latex` 核心 API（被 server handler 与 MCP server 共用）

```ts
// packages/researchos-latex/src/index.ts

export interface LatexError {
  file: string
  line: number
  message: string
  severity: "error" | "warning"
}

export interface CompileResult {
  ok: boolean
  pdf_path?: string
  log: string
  errors: LatexError[]
  duration_ms: number
}

/** 定位/确保 tectonic 二进制可用，缺失时按平台下载（带 SHA256 校验） */
export async function ensureTectonic(): Promise<string> /* 返回二进制绝对路径 */

export async function compile(input: {
  workspace: string
  main_file: string
}): Promise<CompileResult>

export type SynctexInput =
  | { kind: "inverse"; pdf_path: string; page: number; x: number; y: number }
  | { kind: "forward"; file: string; line: number }

export type SynctexResult =
  | { file: string; line: number }
  | { page: number; x: number; y: number }

export async function synctex(input: SynctexInput & { workspace: string }): Promise<SynctexResult>

export interface FormatIssue {
  file: string
  line: number
  rule: string
  message: string
}

export async function formatCheck(input: {
  workspace: string
  main_file: string
  template?: "ieee" | "acm"
}): Promise<{ issues: FormatIssue[] }>

/** BibTeX key 解析，供前端补全与 format_check 的引用完整性检查共用 */
export function parseBibtex(content: string): { key: string; title?: string; author?: string; year?: string }[]

/** 章节大纲解析 */
export function parseOutline(content: string): { level: number; title: string; line: number }[]
```

实现要点：

- `compile`：`spawn(tectonic, ["--synctex", "--keep-logs", "--outdir", ".researchos/latex/build", main_file], { cwd: workspace })`。Tectonic 单遍即完成多轮迭代与宏包下载，无需多次调用。超时默认 120s，子进程写入限 workspace 内（tectonic 本身只写 outdir 与 cache）。
- 错误提取：Tectonic 的 stderr 行格式为 `error: <message>` 配合 `file.tex:line:` 上下文行；另扫描 `.log` 中 `^!<message>` 与 `l.<line>` 行对，产出结构化 `LatexError[]`。两处来源去重（file+line+message）。
- `synctex`：解析 `.synctex.gz`（Bun 内建 gunzip 后为文本块格式）。
  - 正向：`Input:` 标签建立 file→行→(page, h, v) 映射，取光标行号最近的记录，换算 PDF 页面坐标（SyncTeX 单位 = sp，÷65536 得 pt）。
  - 反向：PDF.js 文本层点击给出 (page, x_pt, y_pt)，在对应 page 的 block 内做最近邻命中，回溯 `Input:` 得 file+line。
- `formatCheck` 规则集（每条规则 = 一个纯函数 `(files: TexFile[]) => FormatIssue[]`）：
  - 通用：`missing-cite-key`（`\cite{key}` 不在任何 `.bib` 中）、`unused-bib-entry`、`unbalanced-braces`、`figure-without-label/caption`。
  - 模板：`ieee` —— 摘要长度、`\section` 标题 title case、禁用 `\pagestyle`；`acm` —— 必须存在 `\acmConference`、author 数与 `\affiliation` 配对。模板规则声明式注册，新增模板只加一个规则表文件。

### 6.2 MCP server（`packages/researchos-latex/src/mcp.ts`）

在 `opencode.json` 注册后，工具以 `latex_compile` / `latex_synctex` / `latex_format_check` 暴露给模型：

```ts
// 关键签名（zod schema 与 5.3 契约一一对应）
server.tool("compile", {
  main_file: z.string().describe("主 tex 文件，相对 workspace"),
  engine: z.literal("tectonic").optional(),
}, async ({ main_file }) => toMcpResult(await compile({ workspace, main_file })))

server.tool("synctex", {
  pdf_path: z.string().optional(), page: z.number().optional(),
  x: z.number().optional(), y: z.number().optional(),
  file: z.string().optional(), line: z.number().optional(),
}, async (args) => toMcpResult(await synctex(toSynctexInput(args))))

server.tool("format_check", {
  main_file: z.string(),
  template: z.enum(["ieee", "acm"]).optional(),
}, async ({ main_file, template }) => toMcpResult(await formatCheck({ workspace, main_file, template })))
```

### 6.3 Server HTTP API（供前端使用）

- `packages/protocol/src/groups/latex.ts`：新增 `LatexGroup`，端点 `POST /latex/compile`、`POST /latex/synctex`、`POST /latex/format-check`、`GET /latex/builds`（历史列表）、`GET /latex/pdf?build_id=`（PDF 字节流，前端 PDF.js 直接用）。
- `packages/protocol/src/api.ts` 注册该 group；`packages/server/src/handlers/latex.ts` 内调用 `@researchos/latex` 核心函数并写 `latex_build` / `latex_format_issue` 表。
- 完成后在 `packages/client` 跑 `bun run generate` 重新生成客户端；`src/generated*` 不手改。

### 6.4 编译触发流程（前端自动编译）

```
编辑器 onDidChangeModelContent
  → 防抖 800ms，期间有新输入则重置
  → 保存文件（写回 workspace）
  → POST /latex/compile { main_file }
  → 响应到达前 UI 显示 spinner；再次触发则服务端取消旧子进程（abort previous spawn）
  → 成功：拉取 PDF 刷新预览 + synctex 索引重建；失败：errors 写入 Monaco markers + 日志面板徽标计数
  → 写 latex_build 行（server 侧完成）
```

## 7. SubAgent 与 Skill 定义

### 7.1 `.opencode/agent/latex-editor.md`

```markdown
---
description: LaTeX 论文写作与编译排错专家。负责修改 tex 源码、修复编译错误、运行格式校验并迭代到编译通过。
mode: subagent
model: anthropic/claude-sonnet-4-5
permission:
  edit: allow
  bash:
    "*": ask
    "tectonic *": allow
  latex_compile: allow
  latex_synctex: allow
  latex_format_check: allow
---

你是 ResearchOS 的 LaTeX 编辑专家，工作在当前研究课题的 LaTeX 项目中。

工作准则：
- 修改任何 tex/bib 文件前先阅读相关章节，保持作者原有的写作风格与宏包选择，不擅自更换文档类或引入新宏包；确需引入时在修改说明中列出。
- 每次编辑完成后调用 latex_compile 验证。编译失败时：从 errors 中定位最早的 error（后续错误常是级联产物），修复后重新编译，最多迭代 5 轮；仍失败则加载 latex-troubleshoot skill 按流程排查，并把未解决的错误与日志摘要交给用户。
- 收到"检查格式/合规"类请求时调用 latex_format_check，逐条报告 issue 并征得同意后修复。
- 插入引用时先解析项目内 .bib 确认 key 存在，不编造 BibTeX 条目；缺失的文献信息交回文献管理流程。
- 所有改动以 diff 形式呈现，不静默改写。
```

### 7.2 `.opencode/skill/latex-troubleshoot/SKILL.md`

```markdown
---
name: latex-troubleshoot
description: LaTeX 编译失败的系统排查流程。当 latex_compile 返回 error 且直接修复无效时使用，覆盖宏包缺失、字体、参考文献、SyncTeX 等常见故障类别。
---

# LaTeX 编译排错流程

按以下顺序排查，每步修复后重新运行 `latex_compile`：

1. **先修第一个 error**：读取 errors 数组首条（file+line+message），后续错误多为级联。
2. **宏包/类缺失**（message 含 `File ... not found`）：确认 tectonic 能联网下载 bundle；若是本地 `.sty/.cls`，检查是否位于项目内且路径被 `\usepackage` 正确引用。
3. **未定义引用**（`Citation undefined` / `Reference undefined`）：检查 .bib 中 key 拼写；用 parseBibtex 思路核对 `\cite{}` 与 bib key 是否一致。
4. **字体错误**：Tectonic 默认走 bundle 字体；系统字体需求（`\setmainfont`）需确认字体已安装，否则建议改用 bundle 内字体。
5. **图表错误**（`File not found` for `\includegraphics`）：核对相对路径以 main_file 所在目录为基准。
6. **仍失败**：完整阅读 `.researchos/latex/build/main.log` 中首个 `!` 行前后 20 行，提取上下文后再修；禁止猜测性大面积重写。

输出格式：故障类别 / 根因 / 修复 diff / 重新编译结果。
```

## 8. 前端界面落地

页面：`packages/app/src/pages/latex/`，路由在 `packages/app/src/app.tsx` 的 `Routes()` 中挂 `/:dir/latex`（DirectoryLayout 下，与 session 路由同级），侧栏 icon rail 在 `packages/app/src/pages/layout/sidebar-shell.tsx` 增加 `𝌆 LaTeX` 入口。

组件拆分（SolidJS）：

```
pages/latex/
├── latex.tsx              # 页面容器：左右分栏（自研 split-pane，拖拽比例持久化到 localStorage）
├── editor-pane.tsx        # Monaco 挂载：latex monarch 语言、bibtex 补全 provider、markers
├── monaco-latex.ts        # Monarch tokenizer + CompletionItemProvider（\cite → parseBibtex 结果）
├── outline-sidebar.tsx    # 章节大纲树（parseOutline 结果，点击跳行；拖拽重排 = 移动源码行区间后保存）
├── preview-pane.tsx       # PDF.js 渲染 + 工具条（编译按钮 / Tectonic 徽标 / SyncTeX 开关 / 缩放）
├── synctex.ts             # 正反向跳转：编辑器光标 ↔ PDF 坐标的双向调用（POST /latex/synctex）
├── log-panel.tsx          # 底部折叠日志条：错误/警告徽标（bg-background-base 面板 + success/error 令牌色）
└── latex-store.ts         # 页面状态：当前 build、issues、main_file 探测结果
```

复用与风格：

- 主题令牌全部消费 `@opencode-ai/ui`（`bg-background-base`、`bg-surface-raised`、文本/成功/错误令牌），不自定义色值；PDF 预览区底色用面板令牌，编译成功/失败徽标用 success/error 令牌。
- 复用 OpenCode 文件树组件选 main_file；日志条目点击 → 文件树定位 + 编辑器 `revealLineInCenter`。
- Monaco 的 latex 语言与补全注册放在 `monaco-latex.ts`，页面卸载时 dispose，避免重复注册。
- 首次编译触发 tectonic 下载时，预览区显示进度条（从 `GET /latex/compile` 的轮询状态或 SSE 读取下载字节进度）。

写作助手面板（3.7 节）以 `latex.tsx` 右侧可折叠 slot 形式预留 `writing-panel` 挂载点，具体实现归模块五。

## 9. 开发步骤与里程碑

按周拆分（W 内任务有序，`→` 表示依赖）：

- **W1 — 核心包与编译链路**
  1. 新建 `packages/researchos-latex`（package.json、`@researchos/*` 命名、tsconfig 沿用 repo 模板）。
  2. `ensureTectonic`：平台探测 + GitHub Releases 下载 + SHA256 校验 + 版本锁定常量。
  3. `compile` + 错误解析（stderr + `.log` 双源）→ 命令行 smoke：`bun run packages/researchos-latex/src/cli.ts <workspace>` 能编译 hello-world.tex。
- **W2 — SyncTeX 与 format_check**
  1. `.synctex.gz` 解析（正向）→ 2. 反向最近邻命中。
  3. `parseBibtex` / `parseOutline` → 4. `formatCheck` 通用规则 + ieee 规则集（acm 第二批）。
- **W3 — Server + MCP 接入**
  1. `LatexGroup` protocol 定义 → `api.ts` 注册 → server handler + drizzle 两张表 → `packages/client` 跑 `bun run generate`。
  2. `mcp.ts` 三个 tool；在测试项目的 `opencode.json` 中注册，Agent 会话内验证 `latex_compile` 可调。
- **W4 — 前端页面**
  1. 路由 + 侧栏入口 + 分栏骨架 → 2. Monaco latex 语言/补全/markers → 3. PDF.js 预览 + 手动编译按钮 + 日志面板 → 4. 保存防抖自动编译。
- **W5 — SyncTeX UI + SubAgent/Skill + 打磨**
  1. 正反向跳转 UI 联调 → 2. 大纲侧栏（含拖拽重排）→ 3. `.opencode/agent/latex-editor.md` + `latex-troubleshoot` skill 落仓并实测 → 4. desktop 打包内置 tectonic 验证（三平台取其二即可）。

里程碑可演示成果：W1 末 CLI 编译出 PDF；W3 末 Agent 一句话触发编译并报告错误；W5 末完整"写 tex → 自动编译 → 点 PDF 跳源码 → 日志面板查错 → Agent 修复"闭环。

## 10. 测试方案

遵守"不在 repo 根目录跑测试"，全部在对应包目录执行 `bun test`；不 mock 文件系统与进程，用真实 fixture 项目。

- **`packages/researchos-latex`（单测 + 集成）**：
  - `test/parse.test.ts`：`parseBibtex` / `parseOutline` 对 fixture 文本的解析结果断言（纯函数，无 IO）。
  - `test/synctex.test.ts`：内置一份预生成的 `main.synctex.gz` fixture（W2 时用 tectonic 对 hello-world 项目生成一次后提交为二进制 fixture），断言正向/反向映射坐标。
  - `test/format-check.test.ts`：构造含 `\cite{missing}`、未配平花括号、缺 caption 的 fixture 项目，断言 rule/file/line。
  - `test/compile.test.ts`（集成，标记为可跳过）：真实调用 tectonic 编译 fixture 项目，断言 `ok`、pdf 存在、errors 结构；CI 无网络时用 `RESEARCHOS_SKIP_TECTONIC=1` 跳过（tectonic 下载需联网）。
- **`packages/server`（handler 测试）**：`latex.test.ts` 走真实 HttpApi 测试客户端（沿用 server 包既有测试模式），断言 compile 后 `latex_build` 行写入、format-check 后 issue 行写入。
- **前端（`packages/app`）**：沿用包内既有 `*.test.ts` 模式，测 `latex-store` 的状态迁移（idle→compiling→success/error）与日志计数逻辑；Monaco/PDF.js 渲染不做单测，靠 W4/W5 手工联调。
- **端到端（W5 手工验收脚本）**：打开 fixture 论文项目 → 修改章节 → 自动编译 → PDF 刷新 → 点击 PDF 反向跳转 → Agent 会话中让 latex-editor 修一个人为制造的错误。

## 11. 风险与开放问题

- **Tectonic 首次下载依赖网络**：bundle 与二进制都从 GitHub Releases 拉取，离线环境首次编译失败。规避：desktop 打包内置二进制 + 常用 bundle 预热（打包期跑一次 fixture 编译把 bundle 缓存带进安装包）待评估体积（~100MB 量级），开放问题。
- **SyncTeX 解析自研的边界**：多文件 `\input` 嵌套、 `\includegraphics` 区域命中精度有限；若实际体验不达标，开放问题——改为调用 `tectonic -X synctex` 或接入 TexLab 的 SyncTeX 能力。
- **Monarch 高亮 vs TexLab LSP**：自研方案无宏级语义，复杂模板下补全/诊断弱。开放问题：后续以独立 LSP 进程接入 TexLab（MIT），Monaco 原生支持 LSP client，架构上兼容。
- **Windows 路径与子进程**：tectonic 在 Windows 下路径分隔符、长路径、杀毒软件拦截 spawn 均可能影响编译；W1 smoke 测试必须覆盖 Windows。
- **format_check 规则维护**：期刊模板规则随年份变化，规则表需可配置化（后续可放 `tectonic.toml` 或全局配置），首期硬编码 ieee/acm 即可。
- **自动编译的资源占用**：大项目每次保存触发全量编译可能数秒；tectonic 增量能力有限。规避：防抖 + 仅 main_file 所在项目触发 + 连续编译合并；开放问题——是否引入"仅语法检查不编译"的轻量模式。
