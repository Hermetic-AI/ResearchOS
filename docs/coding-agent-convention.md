# ResearchOS Coding Agent 公约

> **本文是对 `AGENTS.md`（OpenCode 上游规则）和 `docs/开发规范.md` 的补充。所有 Coding Agent（无论模型/工具）必须遵守本文的全部规则。**
> 冲突优先级：本文 ≈ `docs/开发规范.md` > 上游 `AGENTS.md`（上游文件内遵循上游风格；`@researchos/*` 与 `.opencode` 预设遵循本文）。

---

## 一、强制初始化流程（每次会话必做）

### 1.1 上下文加载

**在开始任何编码工作前**，Coding Agent 必须按顺序读取以下文件：

```
1. AGENTS.md（仓库根目录）               — OpenCode 上游代码风格
2. docs/coding-agent-convention.md      — 本文（全 Agent 公约）
3. docs/dependency-inventory.md         — 可用依赖清单
4. docs/ai-coding-dev-plan.md           — 开发计划（当前阶段、模块依赖）
```

### 1.2 环境确认

```bash
git branch --show-current           # 确认分支名 ≤3 词
git status --short                  # 确认待修改文件
bun --version                       # 确认工具链可用
```

---

## 二、工作纪要（MANDATORY — 强制机制）

### 2.1 规则

**每个 Agent 每次编码会话结束时，必须在 `.sisyphus/sessions/` 目录下生成一份工作纪要。**

- 纪要文件是**机器可解析的 YAML frontmatter + Markdown 正文**格式
- 所有 Agent 不论模型/工具（Claude、GPT、Gemini 等）都必须遵守此规则
- 这是**跨 Agent 会话交接的唯一可信信息源**

### 2.2 文件路径约定

```
.sisyphus/sessions/{YYYY-MM-DDTHHmmss}-{agent}-{phase}-{task}.md
```

示例：
```
.sisyphus/sessions/2026-07-23T143000-claude-P1-literature-mcp-server.md
.sisyphus/sessions/2026-07-23T153000-gpt-P4-plot-mermaid-render.md
```

### 2.3 文件格式

```markdown
---
agent: "claude-sonnet-4"             # Agent 模型标识
tool: "Claude Code"                   # 使用的 Coding 工具
session_start: "2026-07-23T14:30:00+08:00"
session_end: "2026-07-23T15:45:00+08:00"
phase: "P1"                           # 对应开发计划阶段
task: "literature-mcp-server"          # 任务简短标识
branch: "literature-mcp"              # 工作分支
status: "completed"                   # completed | partial | blocked | failed
files_created:                         # 新建文件列表
  - "packages/researchos-mcp/literature/src/server.py"
  - "packages/researchos-mcp/literature/tools/search.py"
files_modified:                        # 修改文件列表
  - "docs/modules/01-literature.md"
checks_passed:                         # 通过的验证
  - "bun typecheck"
  - "uv run pytest"
checks_failed:                         # 失败的验证
  - ""
next_steps:                            # 下一步建议（给下一个 Agent 看）
  - "register MCP server in opencode.researchos.json"
  - "create protocol group for literature endpoints"
---

## 完成内容

（本次会话完成的具体工作描述，用中文写）

## 关键决策

1. MCP tool 命名采用 `literature_search` / `literature_import_pdf` 等，与总体方案 5.1 接口一致。
2. FastMCP 版本选 2.x，不用 1.x 的 `@server.call_tool()` 旧 API。

## 遗留问题

- GROBID 集成留到 v2，PDF 参考文献提取首版用规则解析。

## 给下一个 Agent 的上下文

- 文献库 SQLite schema 已定义在 `packages/researchos-literature/src/schema.ts`。
- 测试用的 PDF fixture 在 `packages/researchos-literature/test/fixtures/`。
- 下一步需要创建 protocol group `researchos-literature.ts` 把 MCP 工具暴露为 HTTP API。
```

### 2.4 摘要索引（MANDATORY）

**每次生成工作纪要后，必须同步更新 `.sisyphus/sessions/INDEX.md`**，在最底部追加一行：

```markdown
| 2026-07-23T14:30 | claude-sonnet-4 | P1 | literature-mcp-server | completed | packages/researchos-mcp/literature/ |
```

格式：
```markdown
| {timestamp} | {agent} | {phase} | {task} | {status} | {key_paths} |
```

### 2.5 跨会话恢复（下一个 Agent 的起手式）

当一个新 Agent 接手工作时，必须：

1. **读取 `.sisyphus/sessions/INDEX.md`** — 了解所有已完成/未完成的会话
2. **读取最近一条 `status: "partial" | "blocked"` 的纪要** — 了解当前阻塞点
3. **读取同 phase 最近一条 `status: "completed"` 的纪要** — 了解上下文
4. **从 `next_steps` 继续工作**

---

## 三、代码编写规则（全 Agent 遵守）

### 3.1 TypeScript 通用规则（摘自上游 AGENTS.md + 开发规范.md）

| 规则 | 说明 |
|---|---|
| **禁用 `any`** | 绝不使用 `any` 类型；依赖类型推断 |
| **禁用 import 别名** | `import { foo as bar }` 禁止 |
| **禁用星号导入** | `import * as X` 禁止；需要命名空间时导入模块自带的 namespace |
| **避免 `else`** | 用 early return 替代 |
| **避免 `try/catch`** | 除非边界确实需要 |
| **避免 `let`** | 用 `const` + ternary / early return |
| **不用 for 循环** | 用 `flatMap` / `filter` / `map` + type guard |
| **不提取单次使用的 helper** | 除非可复用、隐藏复杂边界或有清晰独立语义 |
| **用 Bun API** | `Bun.file()` / `Bun.write()`，不用 `fs` 回调式 |
| **变量 inline** | 只使用一次的中间变量不声明，直接 inline |
| **动点类型推断** | 仅在导出/澄清处写类型注解 |
| **Effect generator** | 先绑定 service 到命名变量再调方法，不嵌套 `yield*` |
| **Drizzle schema** | 字段用 snake_case，不重复写字段名字符串 |

### 3.2 ResearchOS 新增规则

| 规则 | 说明 |
|---|---|
| **包边界不可逆** | `@researchos/*` 禁止 import `@opencode-ai/core` / `server` |
| **动态 import 重模块** | 启动路径敏感的包用动态 import 就近解构 |
| **SQLite 统一** | 用 `bun:sqlite`；路径集中到各包的 `paths.ts`；WAL 模式；写操作幂等（upsert by 唯一键） |
| **MCP tool 命名** | server 名与工具名全小写下划线（`literature_search`），与 `{server}_{tool}` 规则兼容 |
| **MCP tool 参数** | zod（TS）/ pydantic（Python），字段注释写清楚——直接进入 LLM 上下文 |
| **Agent/Skill markdown** | frontmatter 只写必要字段（name/description/mode/model/permission/color）；prompt 正文中文写行为规范、英文写术语 |
| **Skill 保持"教授方法论"** | 不堆代码，可执行逻辑放 plugin/MCP tool |
| **AI 写入纪律** | 论文/笔记/代码写入必须通过 OpenCode 原生 edit 通道产生 diff review，禁止 MCP tool 静默改写 |
| **API key 安全** | key 只走 OpenCode credential/secret 机制，不写入代码、fixture 或 `.opencode` 预设 |

### 3.3 Python 侧规则（`packages/researchos-mcp/*`）

| 规则 | 说明 |
|---|---|
| 包管理 | **uv**（`pyproject.toml` + `uv.lock` 入库）；每 server 独立 project，不共享 venv |
| Lint | **ruff**（`line-length = 100`） |
| 类型检查 | **pyright** basic 模式 |
| FastMCP 工具 | 必须有 docstring；返回结构化 dict，不返裸字符串 |
| 沙盒纪律 | 文件读写只允许课题目录白名单；subprocess 仅受控场景；网络出站走白名单 |
| 测试 | **pytest**，`uv run pytest` |

---

## 四、Git 与 PR 规则

### 4.1 分支

```yaml
格式: "<word1>-<word2>-<word3>"      # 最多 3 词，连字符分隔
正确: "literature-mcp"
      "graph-rag-query"
      "fix-pdf-extract"
错误: "feat/literature-mcp"           # 禁止斜线
      "feature-literature"            # 禁止类型前缀，且 >3 词
```

### 4.2 提交

```
type(scope): summary

type ∈ feat | fix | docs | chore | refactor | test
scope ∈ literature | graph | latex | data | writing | plot | reproduce | app | protocol | preset | api-hub | translate

示例:
  feat(literature): add mcp search tool with four-source parallel fetch
  fix(graph): handle empty wikilink parse edge case
  chore(protocol): regenerate client sdk after group changes
```

### 4.3 PR 硬性要求

- **侵入点检查**：若 diff 触及任何非 `@researchos/*`、非 `docs/`、非 `packages/researchos-preset/` 的文件（即碰到 §1.3 受控侵入点），PR 描述**必须含"侵入点说明"一节**：
  - 改了哪个文件
  - 改了多少行
  - 为什么不能用下游机制实现
  - 合并策略（单行追加 / 标记包裹 / 纯新增）

### 4.4 提交前 Checkpoint（自检清单）

```bash
# 1. 类型检查
cd packages/researchos-<x> && bun typecheck     # TS 包
cd packages/researchos-mcp/<x> && uv run pyright # Python 包

# 2. 测试
cd packages/researchos-<x> && bun test          # TS 包（不可在根目录跑）
cd packages/researchos-mcp/<x> && uv run pytest  # Python 包

# 3. Client regenerate（如改动了 protocol 或 server HttpApi）
cd packages/client && bun run generate
# 确认 check:generated 干净

# 4. App 编译（如改了前端代码）
cd packages/app && bun typecheck

# 5. 检查清单
[ ] 是否触碰了上游文件？→ 有 researchos:start/end 标记？
[ ] 是否新增依赖？→ 已更新 docs/dependency-inventory.md？
[ ] 是否新增包？→ 包内有 README？
[ ] 是否改动模块行为？→ docs/modules/0X-*.md 已同步？
[ ] husky 钩子是否全绿？→ 未使用 --no-verify
```

---

## 五、文档维护规则

| 触发条件 | 必须执行的文档更新 |
|---|---|
| 新增/修改模块功能 | 更新 `docs/modules/0X-<name>.md` |
| 新增 ResearchOS 包 | 包内写 README（用途、公开 API、测试命令）+ 更新 `docs/代码结构与上游同步.md`  |
| 新增外部依赖 | 更新 `docs/dependency-inventory.md` |
| 修改侵入点/目录结构/同步流程 | 更新 `docs/代码结构与上游同步.md` |
| 修改 build/generate/ci 流程 | 更新本文（coding-agent-convention.md） |
| **所有文档与代码同 PR 提交，不后补** | — |

---

## 六、禁止事项（零容忍）

| 禁止 | 后果 |
|---|---|
| `as any` / `@ts-ignore` / `@ts-expect-error` | PR 拒绝 |
| 修改 `packages/client/src/generated*`（手改） | CI `check:generated` 失败 |
| 在仓库根目录跑测试 | 测试注定失败（有 `do-not-run-tests-from-root` 守护） |
| `import * as X from ...` / `import { a as b }` | PR 拒绝 |
| 在 `patches/` 下新增补丁 | 默认不允许（除非确属升级需要且经评审） |
| 修改禁止改动区的文件 | PR 拒绝 |
| MCP tool 静默改写用户文档 | 违反 AI 写入纪律 |
| API key 写入代码/fixture | 安全红线 |
| 使用 `--no-verify` 跳过 husky | PR 拒绝 |
| 使用 `git push --force` 到 `dev` | 破坏分支 |

---

## 七、工具链快速参考

| 用途 | 命令 | 说明 |
|---|---|---|
| TS 类型检查 | `cd packages/<x> && bun typecheck` | 从包目录运行，非根目录 |
| TS 测试 | `cd packages/<x> && bun test` | 同上 |
| Python lint | `cd packages/researchos-mcp/<x> && uv run ruff check` | |
| Python 类型 | `cd packages/researchos-mcp/<x> && uv run pyright` | basic 模式 |
| Python 测试 | `cd packages/researchos-mcp/<x> && uv run pytest` | |
| Client 重新生成 | `cd packages/client && bun run generate` | protocol/server 变更后必须执行 |
| App 编译 | `cd packages/app && bun typecheck` | 前端改动后 |
| 安装依赖 | `bun install` | 根目录 |
| LSP 诊断 | `lsp_diagnostics` on changed files | 每个编辑后 |
