# 模块八：Agent 资产管理中心（Asset Center）技术落地文档

> 对应《ResearchOS最终方案.md》「模块八」与「5.8 Agent 资产管理 Skill / API 组」、《ResearchOS-UI设计.md》3.9 与 3.2 节。本模块是 Skill / MCP / SubAgent / Model / Command / Rules / Hook（Plugin）七类 Agent 资产的**统一配置入口**，核心原则：**不重复造轮子——OpenCode 原生已有全部资产的定义机制、只读 list API 和部分写入通道，本模块做"聚合 + 补缺 + 在对话页暴露使用方式"**。

---

## 1. 模块概述与目标

OpenCode 把 Agent 资产分散在多个交互面上：模型管理在 composer popover 与 settings-v2，MCP 开关在 dialog-select-mcp，Skill 折叠在 slash 菜单里，Rules（AGENTS.md）与 Hook/Plugin 完全没有 UI。ResearchOS 面向科研人员，需要一个"设置中心式"的统一入口，让非工程背景用户也能配置 Agent 运行环境。

**目标：**

1. 一个页面聚合七类资产的**只读视图**（全部来自原生 list API，零新读通道）。
2. 补齐原生缺失的**写路径 UI**：Skill 新建/编辑、MCP server 添加/编辑（持久化）、Rules 查看/编辑、插件启停、Agent/Command 编辑。
3. 在对话页（session composer）暴露资产的**使用方式**：资产快捷条 chip、`@` 提及扩展（@Skill / @文献 / @数据集）。
4. 提供 `researchos-preset` 一键安装通道，让科研 Skill / SubAgent / MCP 模板一键落入课题。

**与非目标的关系**：本模块属于总方案 P0 底座，不产出科研数据，不依赖其他模块（@文献 / @数据集 芯片消费模块一/四的 API，属于可选增强，见 §11）。

---

## 2. 功能清单与范围边界

**做什么（对照总方案功能清单）：**

| 功能 | 通道 | 说明 |
| --- | --- | --- |
| 统一资产页 | 前端路由 `/:dir/assets` | 左导航 + 七面板，每项带数量徽标与状态点 |
| Skill 管理 | `GET /api/skill` + 新增 `asset.file_write` | 卡片列表（名称/描述/来源/启用）；frontmatter 表单 + markdown 编辑器，保存落盘 `.opencode/skill/<name>/SKILL.md` |
| MCP 管理 | legacy `GET /mcp` + `POST /mcp/:name/connect\|disconnect\|auth` + `PATCH /config` | 列表复用原生状态徽标语义（connected/failed/needs_auth/disabled）；新增"添加 server"表单（local command / remote url），**双写**：runtime add + config 持久化 |
| Model 管理 | `GET /api/model` / `GET /api/provider` + 原生组件 | 直接复用 `DialogManageModelsV2` 可见性语义（`local.model.setVisibility`）与 settings-v2 providers/models 页能力，聚合为一个面板 |
| SubAgent 管理 | `GET /api/agent` + `asset.file_write` | agent 列表（mode 徽标/颜色点/模型）；frontmatter 表单（description/model/permission/color）+ prompt 正文编辑；新建向导 |
| Command 管理 | `GET /api/command` + `asset.file_write` | slash 命令列表（command/skill/mcp 三源徽标），command markdown 可编辑 |
| Rules 管理 | 新增读逻辑（文件直读）+ `asset.file_write` | AGENTS.md 查看器/编辑器，标注加载链路（课题级 → 全局 `~/.config/opencode/AGENTS.md` → config `instructions` 键） |
| Hook·Plugin 管理 | status popover 数据源 + `PATCH /config` | 插件列表 + 注册 hook 点 chip 可视化（`event` / `tool.execute.before` / `config` / `chat.params` 等）；启停写 config `plugin` 数组 |
| preset 一键安装 | 新增 `asset.preset_install` | `researchos-skills` / `researchos-agents` / `researchos-mcp` 三个包，拷贝到课题 `.opencode/` 对应目录 |
| composer 资产快捷条 | 前端（侵入点，researchos 标记） | 当前课题启用的 Skill/Agent 以 chip 展示，点击插入 `/skill名` 或 `@agent名` |
| `@` 提及扩展 | 前端 prompt-input-v2（侵入点，researchos 标记） | 在原生 @子代理 / @MCP resource 基础上扩展 @Skill、@文献、@数据集（上下文芯片） |

**不做什么（明确边界）：**

- **不做 workflow 编排器**（多步流水线、可视化 DAG）——首版超出必要范围，多步编排由 SubAgent prompt + Command 组合覆盖。
- **不做独立 prompt 库**（prompt 模板收藏/分类/分享）——prompt 模板需求由 Command（slash 模板）与 Skill（领域知识）机制覆盖，不发明第三套模板体系。
- 不重做模型选择器、MCP toggle、OAuth 流程等原生已有交互，只做聚合入口与跳转。
- 不做 Skill 市场/在线分发——preset 包随 ResearchOS 分发，本地安装。
- 不动 `packages/core` / `packages/opencode` 的 agent 运行时、skill 加载、MCP 运行时（禁止改动区）。

---

## 3. 技术选型与开源依赖

本模块刻意**几乎不引入新依赖**——资产机制全部复用原生，新增代码是薄聚合层。

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 资产读路径 | 原生 V2 protocol list API（`GET /api/agent|command|skill|model|provider`）+ legacy instance HttpApi（`GET /mcp`、`GET /config`） | 原生已聚合全部来源（built-in / 项目 `.opencode/` / 全局 / config 键），自建读逻辑只会重复且漂移 | — |
| config 写入 | legacy `PATCH /config`（`Config.update`，项目级）与全局 config 更新（`Config.updateGlobal`，groups/global.ts） | 原生唯一已验证的 config 写通道；全局侧走 `patchJsonc` 保留注释 | — |
| jsonc 局部改写 | `jsonc-parser`（npm，`modify`/`applyEdits`）——**已是仓库依赖**（`packages/opencode/src/config/config.ts:13` 在用） | 资产中心自写 `opencode.json` 时保留用户注释与格式；零新增依赖 | MIT |
| MCP 运行时通道 | legacy `POST /mcp`（runtime add）、`POST /mcp/:name/connect|disconnect|auth` | 原生连接管理与 OAuth 流程，不重造 | — |
| 文件类资产落盘 | 新增 protocol group `researchos-assets` + server handler（Bun/FSUtil 文件写） | 原生没有任何"写 `.opencode/skill|agent|command/` 文件"的 API，唯一必须新增的 endpoint | — |
| preset 包 | `@researchos/preset`（`packages/researchos-preset`，bun workspace 内 TS 包，内容是 markdown/json 资产文件） | 与代码结构方案一致；handler 侧按包路径解析拷贝，不需要打包发布流程 | — |
| 前端 | SolidJS + `@opencode-ai/ui` 组件与主题令牌 + app 现有 server-sync / global-sync 状态层 | 与 app 全站同栈；只消费公开组件不 fork 源码 | — |
| 数据存储 | 基本无新表；可选 `.researchos/assets.db`（SQLite，preset 安装记录 + 资产快照缓存） | 资产真源在文件系统与 config，数据库只存 ResearchOS 自己产生的元数据 | — |

依赖方向合规性：protocol `researchos-assets` group 只放 Schema；server handler 位于 server 下游；app 前端只经 Client SDK 访问，不依赖 Core/Server。

---

## 4. 落地形态决策

**读路径——全部复用原生 list API，不新增任何读 endpoint：**

| 资产 | 读通道 | 备注 |
| --- | --- | --- |
| Model / Provider | `GET /api/model`、`GET /api/provider`（V2 protocol） | settings-v2 已在用 |
| Agent / Command / Skill | `GET /api/agent|command|skill`（V2 protocol） | command 列表原生已三源合一（`command/index.ts:134-152`，skill/mcp prompt 带来源徽标） |
| MCP 状态 | legacy `GET /mcp` | 含 connected/failed/needs_auth/disabled 状态与工具数 |
| config 原文 | legacy `GET /config` | MCP 编辑表单、plugin 数组、instructions 键的数据源 |
| Rules 内容 | `asset.file_read`（随 `researchos-assets` 一并实现，见 §6.4 说明） | 唯一例外：AGENTS.md 正文没有任何 API 暴露，需文件直读；归入 file_write 同组 |

**写路径——复用优先，唯一新增 endpoint 是文件落盘：**

| 操作 | 通道 | 理由 |
| --- | --- | --- |
| MCP 增删改、plugin 启停、默认模型 | `PATCH /config`（项目级）/ 全局 config 更新 | 原生通道，app 的 settings-v2 已验证 |
| MCP 添加（立即生效） | legacy `POST /mcp`（runtime add）**双写** `PATCH /config`（持久化） | runtime add 不持久化，必须双写保证重启后仍在（见 §6.2） |
| MCP connect / disconnect / OAuth | legacy `POST /mcp/:name/connect\|disconnect\|auth` | 复用 `useMcpToggle` 同款通道 |
| 模型可见性 | 原生 `local.model.setVisibility`（client-local） | 原生语义就是"客户端偏好"，不落 config |
| Skill / Agent / Command / Rules 落盘 | **新增 `asset.file_write`**（protocol group `researchos-assets`） | 原生无文件写 API |
| preset 安装 | **新增 `asset.preset_install`**（同 group） | 批量拷贝 + 可选 config patch，需服务端事务性 |

**UI 复用清单（不重造的交互）：**

- `DialogManageModelsV2`（模型可见性开关）——模型面板直接内嵌或按同语义实现面板版本；
- `dialog-select-mcp.tsx` 的 toggle 逻辑与 `useMcpToggle`（connect/disconnect/auth）——MCP 面板逐行复用；
- settings-v2 providers/models 页的 Provider Connect / Custom provider 对话框——模型面板"管理"入口跳转或内嵌；
- `ModelSelectorPopoverV2`（dialog-select-model.tsx）——composer 模型选择器保持原样，仅加"管理"跳转；
- status popover 的插件列表数据源——Hook·插件面板复用。

**受控侵入点新增（须同步更新《代码结构与上游同步.md》§3.2 清单）：**

| # | 侵入点 | 修改内容 |
| --- | --- | --- |
| 2/3（既有模式） | `packages/protocol/src/groups/researchos-assets.ts` + `packages/server/src/handlers/researchos-assets.ts` | 纯新增文件 + `api.ts` 单行追加，符合既有 group 模式 |
| 4/5（既有模式） | `packages/app/src/app.tsx` 路由 + `sidebar-shell.tsx` rail 入口 | `researchos:start/end` 标记包裹 |
| **6（新增）** | `packages/app/src/pages/session/composer/`（资产快捷条挂载）+ prompt-input-v2（`@` 提及扩展） | 上游 composer 是活跃改动区，属高冲突热点；全部改动用标记包裹并集中到尽量少的 hunk |

---

## 5. 数据模型与本地存储设计

### 5.1 为什么基本无新表

七类资产的真源（source of truth）都是 **OpenCode 原生机制已经读取的位置**：

- Skill/Agent/Command → `.opencode/skill|agent|command/` 与全局 `~/.config/opencode/` 下的 markdown 文件，以及 config 的 `agents`/`commands` 键；
- MCP / Plugin / instructions → `opencode.json`（课题级）与全局 config；
- Model/Provider → config + 原生 provider 状态；可见性 → client-local storage。

若 ResearchOS 再建一份资产注册表，必然与原生 list API 的聚合结果漂移（原生聚合 built-in / 项目 / 全局 / config 四源）。**正确做法是每次展示时走原生 list API 实时读，数据库不存资产本体。**

### 5.2 可选 `.researchos/assets.db`（仅存 ResearchOS 自有元数据）

两张小表，随课题走，进 `.researchos/`（与其他模块同目录约定）：

```sql
-- preset 安装记录：支持"已安装"标记、重复安装去重、卸载
CREATE TABLE IF NOT EXISTS preset_install (
  id            TEXT PRIMARY KEY,
  pack          TEXT NOT NULL,            -- researchos-skills | researchos-agents | researchos-mcp
  target        TEXT NOT NULL,            -- project | global
  files         TEXT NOT NULL,            -- JSON: 实际落盘的相对路径数组
  config_patch  TEXT,                     -- JSON: mcp 模板写入 config 的键（用于卸载回滚）
  installed_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_preset_install_pack ON preset_install(pack, target);

-- 资产快照缓存（可选优化）：资产页冷启动时先渲染上次快照，list API 返回后增量替换
CREATE TABLE IF NOT EXISTS asset_snapshot (
  kind        TEXT NOT NULL,              -- skill | agent | command | mcp | model | plugin | rules
  name        TEXT NOT NULL,
  payload     TEXT NOT NULL,              -- JSON: 上次 list API 返回的该资产条目
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (kind, name)
);
```

首版 `asset_snapshot` 可不做（list API 均为本地聚合，延迟可忽略），先只落 `preset_install`。

---

## 6. 核心接口实现

### 6.1 protocol group 定义（`packages/protocol/src/groups/researchos-assets.ts`）

新增文件，只放 Schema 与 endpoint 契约；`api.ts` 单行追加注册，随后 `cd packages/client && bun run generate` 重新生成 SDK（`src/generated*` 不可手改）。

```ts
// 契约要点（Schema 定义按 protocol 包现有 group 写法）
asset.file_read   POST /api/researchos-assets/file/read
  入参: { kind: "rules", scope: "project" | "global" }
  出参: { path: string, content: string, chain: Array<{ path: string, exists: boolean }> }
  // chain = 生效加载链路（课题级 AGENTS.md → 全局 ~/.config/opencode/AGENTS.md），供 Rules 面板顶部标注

asset.file_write  POST /api/researchos-assets/file/write
  入参: {
    kind: "skill" | "agent" | "command" | "rules",
    name: string,                 // rules 时忽略
    content: string,              // 完整文件正文（含 frontmatter，由前端编辑器组装）
    scope: "project" | "global",
  }
  出参: { path: string, reloaded: boolean }

asset.preset_install  POST /api/researchos-assets/preset/install
  入参: { pack: "researchos-skills" | "researchos-agents" | "researchos-mcp",
          target: "project" | "global" }
  出参: { installed: string[], configPatched: string[] }
```

### 6.2 server handler（`packages/server/src/handlers/researchos-assets.ts`）

**路径约定**（scope=project 时以 instance directory 为根，global 时为 `Global.Path.config`）：

| kind | project | global |
| --- | --- | --- |
| skill | `.opencode/skill/<name>/SKILL.md` | `~/.config/opencode/skill/<name>/SKILL.md` |
| agent | `.opencode/agent/<name>.md` | `~/.config/opencode/agent/<name>.md` |
| command | `.opencode/command/<name>.md` | `~/.config/opencode/command/<name>.md` |
| rules | `AGENTS.md`（课题根） | `~/.config/opencode/AGENTS.md` |

**实现要点：**

1. **name 校验**：`^[a-z0-9][a-z0-9-]*$`，拒绝路径分隔符与 `..`；写入前 resolve 后断言目标路径仍在资产目录内（防目录穿越）。
2. **原子写**：写临时文件再 rename，避免半截文件被 skill 发现机制读到。
3. **写后生效**：写完触发资产重载（见 6.3，热重载是开放问题，handler 返回 `reloaded` 告知前端是否即时生效）。
4. **preset_install**：解析 `@researchos/preset` 包内 `skill/`、`agent/`、`command/` 目录逐个走同一套落盘逻辑；`researchos-mcp` 包额外把模板合并进 `opencode.json` 的 `mcp` 键（用 `jsonc-parser` 的 `modify`/`applyEdits` 局部改写，保留用户注释），随后调 `Config.invalidate`。全部成功后写 `preset_install` 记录；任一失败回滚已落盘文件（先写后删，简单可靠）。
5. **错误模型**：沿用现有 handler 的 `HttpApiError.BadRequest` / `NotFound`，message 中携带具体路径，前端 toast 展示。

### 6.3 热重载方式（调研结论 + 开放问题）

调研事实：

- `Config.updateGlobal`（全局写）在内容变化时调用 `invalidate()`（`config/config.ts` 的 `updateGlobal`）；`Config.update`（项目级）只写文件、不显式 invalidate。
- Skill / Agent / Command 的运行时状态是 `InstanceState`（如 `skill/index.ts:259-284`），**没有订阅文件系统 watcher**——core 侧虽有 `Watcher.Event.Updated`（`@opencode-ai/core/filesystem/watcher`），目前仅 VCS 订阅（监听 git HEAD，`project/vcs.ts:320`）。
- `InstanceState.invalidate` 存在（`effect/instance-state.ts:64`），`InstanceStore.disposeDirectory` 会触发该 directory 全部 InstanceState 缓存失效（`effect/instance-registry.ts` 的 disposer 链）。

因此 handler 的可用手段（按侵入度排序，实现时验证取最轻者）：

1. 写完文件后对相应 InstanceState 调 `InstanceState.invalidate`（需要各资产模块暴露对应句柄，若未暴露则不可行）；
2. 调 `InstanceStore.disposeDirectory(directory)` 让整个 instance context 惰性重建（粗粒度但必然生效，代价是下一次请求重建全部 instance 状态）；
3. 在资产模块中订阅 `Watcher.Event.Updated` 自动失效——属于改上游运行时，**不做**，除非上游官方化。

**开放问题**：以上 1/2 哪条在当前代码下对 Skill 发现（`discoverSkills` 缓存于 InstanceState）真正生效，需写集成测试验证；若均不生效，首版降级为"保存后提示重启/重开会话"，`reloaded: false` 如实返回。

### 6.4 config_patch / mcp_add 的通道映射（前端封装，无新 endpoint）

```ts
// packages/app 内的薄封装（src/pages/assets/api.ts），只是原生通道的组合
async function configPatch(scope: "project" | "global", patch: ConfigV1.Info) {
  // scope=project → legacy PATCH /config（Config.update）
  // scope=global  → legacy 全局 config 更新（Config.updateGlobal，jsonc 友好）
}

async function mcpAdd(input: {
  name: string
  type: "local" | "remote"
  command?: string[]   // local
  url?: string         // remote
  env?: Record<string, string>
  enabled: boolean
}) {
  // 1) PATCH /config：{ mcp: { [name]: { type, command|url, env, enabled } } } —— 持久化
  // 2) legacy POST /mcp —— runtime add，当前会话立即生效（不持久化，所以必须先 1 后 2）
  // 若 2 失败：保留 config（重启后仍生效），toast 提示连接错误，状态徽标走原生 failed
}

// mcp 编辑 = configPatch（改 mcp 键）+ 视情况 disconnect/connect 重建
// mcp_toggle / OAuth = 原生 POST /mcp/:name/connect|disconnect|auth（useMcpToggle 同款）
```

**注意**：调研发现项目级 `Config.update` 实际写入 `<project>/config.json`（`config/config.ts:626`）且为整体 JSON 重写（丢注释），而课题组配置文件惯例是 `opencode.json`/`opencode.jsonc`。对策：MCP/plugin 的写回**不走 `PATCH /config` 而由 `researchos-assets` handler 用 `jsonc-parser` 直接局部改写课题 `opencode.json(c)`**，再调 `Config.invalidate` 使运行时重读——这与全局侧 `updateGlobal` 的 `patchJsonc` 行为对齐。`PATCH /config` 仅保留给不介意落在 `config.json` 的项（如默认模型）或作为降级路径。此取舍列入 §11 风险。

### 6.5 Agent 侧辅助 tool：`asset.list_enabled`

以 plugin tool 形式提供（放 `@researchos/preset` 附带的小 plugin 或独立 `packages/researchos-assets-plugin`），供 SubAgent 自检运行环境：

```ts
// tool({ description, args: {}, execute }) —— 内部调原生服务聚合
asset.list_enabled() → {
  skills: string[],        // Skill.available() 过滤权限后
  agents: string[],        // 当前可调用的 subagent
  mcp_servers: Array<{ name: string, status: string }>,
  models: { provider: string, model: string },   // 当前默认
}
```

---

## 7. SubAgent 与 Skill 定义

**结论：本模块不定义科研 SubAgent 与领域 Skill**——资产管理中心是"管理资产的基础设施"，自身不是科研能力；paper-reading / graph-rag 等 Skill 与 literature / plot 等 SubAgent 由各业务模块文档（01–07）定义、经 `researchos-preset` 分发，本模块只负责让它们**可见、可编辑、可一键安装**。

唯一附带的是一个可选诊断 SubAgent，验证资产中心本身的安装链路（也是 preset 安装功能的首个真实用户）：

```markdown
---
name: asset-doctor
description: 诊断当前课题的 Agent 资产环境：MCP 连接失败原因、Skill 未启用、Rules 缺失、插件未注册
mode: subagent
color: orange
tools:
  asset.list_enabled: true
---

## 职责
- 调用 asset.list_enabled 获取当前生效资产快照，与用户对课题的预期配置比对
- 对 failed/needs_auth 的 MCP server 给出修复建议（命令是否存在、env 缺失、需重新 OAuth）
- 检查课题根是否缺少 AGENTS.md、.opencode/skill 是否为空，建议从 researchos-preset 安装

## 约束
- 只读诊断：不直接修改 config 或文件，修复动作一律给出建议由用户在资产中心确认
```

`asset-doctor.md` 随 `researchos-preset/agent/` 分发。首版可以先不做，列入 W5 可裁剪项。

---

## 8. 前端界面落地

### 8.1 路由与入口

- 路由：`/:dir/assets`，在 `packages/app/src/app.tsx` 的 `<Route>` 列表尾部以 `researchos:start/end` 标记追加；
- 入口：`packages/app/src/pages/layout/sidebar-shell.tsx` icon rail 追加 ⧉ 图标（同标记约定）；
- 面板内导航用 query param（`/:dir/assets?tab=mcp`），支持 composer"管理"入口深链到指定面板。

### 8.2 组件拆分（`packages/app/src/pages/assets/`）

```
packages/app/src/pages/assets/
├── assets-page.tsx              # 布局：左导航（七项 + 数量徽标/状态点）+ 右面板容器
├── assets-nav.tsx               # 左导航；MCP 有 failed 时红点（订阅 legacy GET /mcp 状态）
├── api.ts                       # §6.4 的通道封装 + client SDK 生成的 researchos-assets 调用
├── panels/
│   ├── skills-panel.tsx         # 卡片栅格（名称/描述/来源目录徽标/启用开关）+ preset 安装按钮
│   ├── skill-editor.tsx         # frontmatter 表单 + markdown 编辑器，保存 → asset.file_write
│   ├── mcp-panel.tsx            # server 列表行（复用 dialog-select-mcp 状态徽标语义）
│   ├── mcp-add-form.tsx         # 添加/编辑表单：名称、type 切换、command[]|url、env 键值对编辑器
│   ├── mcp-templates.tsx        # ResearchOS 模块 MCP 模板区（文献/数据/绘图一键接入）
│   ├── models-panel.tsx         # Provider 分组 + 可见性开关（DialogManageModelsV2 语义）+ Connect/Custom 入口
│   ├── agents-panel.tsx         # agent 列表（mode 徽标/颜色点/模型）+ 新建向导
│   ├── agent-editor.tsx         # frontmatter 表单（description/model/permission/color）+ prompt 编辑器
│   ├── commands-panel.tsx       # 三源徽标列表 + command markdown 编辑
│   ├── rules-panel.tsx          # AGENTS.md 编辑器 + 顶部加载链路标注（asset.file_read 的 chain）
│   └── plugins-panel.tsx        # 插件列表 + hook 点 chip（event/tool.execute.before/config/...）+ 启停开关
```

数据来源：app 现有 `server-sync.tsx` / `global-sync/child-store.ts` 已维护 V2 list API 的响应式状态，面板优先从中取数；legacy 面（MCP 状态、config 原文）经 client SDK 直调。

### 8.3 composer 资产快捷条（侵入点 6a）

- 位置：`packages/app/src/pages/session/composer/` 内新增 `asset-ribbon.tsx`，在 composer 组件挂载点以 `researchos:start/end` 标记插入一行可折叠 chip 栏；
- 数据：当前课题启用（permission 未 deny）的 Skill + 常用 SubAgent（@mention 同源过滤：`mode!=="primary" && !hidden`）；
- 行为：点击 chip 向 prompt-input-v2 插入 `/skill名 ` 或 `@agent名 `；末尾 `+ 管理` chip 跳转 `/:dir/assets`。

### 8.4 `@` 提及扩展（侵入点 6b）

- 接入点：prompt-input-v2 的 mention 源注册处（原生已有 @subagent、@MCP resource 两类 source），以标记包裹追加三类 source：
  - `@skill`：数据来自 `GET /api/skill`，插入为上下文芯片（等价于在 prompt 中引用 skill 名，提示 agent 使用 skill tool）；
  - `@文献`：数据来自模块一 literature API（`researchos-literature` group），插入文献引用芯片（paper_id）；
  - `@数据集`：数据来自模块四 data API，插入数据集芯片。
- `@文献`/`@数据集` 依赖模块一/四就位，未就位时 source 注册跳过（空实现降级，不报错）。

### 8.5 复用而非重写的部分

模型面板内嵌 `DialogManageModelsV2` 或按同语义实现；MCP toggle/OAuth 复用 `useMcpToggle`；Provider Connect/Custom 复用原生对话框组件；全部页面只消费 `@opencode-ai/ui` 公开组件与主题令牌，不 fork 组件源码。

---

## 9. 开发步骤与里程碑

按周拆分（总方案 P0 阶段内，无其他模块依赖；8.4 的 @文献/@数据集 源依赖模块一/四，列为可选并行项）：

- **W1｜protocol + handler 骨架**：`researchos-assets` group 契约、server handler（file_write 四类路径 + 校验 + 原子写）、`bun run generate` 跑通；`preset_install` 落盘部分（不含 mcp 模板）；热重载方案（§6.3）做技术验证并锁定。
- **W2｜资产页骨架 + Skill 面板**（依赖 W1）：路由/rail 入口/左导航；skills-panel + skill-editor 全链路（列表→编辑→落盘→生效）；rules-panel（file_read/file_write）。
- **W3｜MCP 面板 + 模型面板**：mcp-panel（复用 toggle）+ mcp-add-form（双写：jsonc 直写 + runtime add）+ mcp-templates；models-panel 聚合 DialogManageModelsV2 与 provider 入口。
- **W4｜Agent / Command / Plugin 面板 + preset 收尾**：agents-panel + agent-editor + commands-panel；plugins-panel（hook 点 chip 从 status popover 数据源提取 + 启停写 config）；preset_install 的 mcp 模板 config 合并与 preset_install 记录表。
- **W5｜composer 集成 + 联调收尾**：asset-ribbon 快捷条；`@skill` mention 源；`@文献`/`@数据集` 源（视模块一/四进度，可裁剪）；asset-doctor（可裁剪）；端到端演示"资产中心新建 Skill → composer chip 插入 → agent 调用成功"；更新《代码结构与上游同步.md》侵入点清单。

---

## 10. 测试方案

遵守仓库规则：**不在 repo 根目录跑测试**，各包目录内执行；`bun typecheck` 也在包目录跑（`packages/protocol`、`packages/server`、`packages/app`、preset 包）。

- **`packages/server`（`bun test`，针对 researchos-assets handler）**：
  - file_write 四 kind × 两 scope 的路径落盘断言（临时目录做 instance directory）；name 注入用例（`../evil`、`a/b`、空名）全部拒绝；
  - 原子写：写入中模拟失败不留半截文件；
  - preset_install：临时 preset 目录 → 断言文件落盘、`preset_install` 记录、失败回滚（中途删一个目标文件制造错误）；
  - mcp 模板合并：对带注释的 `opencode.jsonc` 断言改写后注释保留、`mcp` 键正确合入（jsonc-parser 行为快照）。
- **`packages/protocol`**：契约 Schema 编解码单测（随 group 模式）。
- **`packages/app`**（包内现有组件测试体系）：mcp-add-form 序列化（local/remote 两模式 → 正确 patch 形状）；assets-nav 状态点（mock MCP failed 状态源）；asset-ribbon chip 点击 → 插入文本断言；skills-panel 按来源徽标分组渲染。
- **集成测试**（`packages/server` 内，标记慢测）：起真实 server，走 client SDK 调 `asset.file_write(skill)` → 断言 `GET /api/skill` 返回新 skill（此测试同时验证 §6.3 热重载结论，若失败则坐实"需重开"降级并断言 `reloaded:false`）；`preset_install(researchos-skills)` → list API 可见。
- **冒烟**：启动 server + app，资产页七面板各完成一次"读 + 一次写"（新建 skill、添加 MCP、切插件开关、改 AGENTS.md），composer chip 插入一次。

---

## 11. 风险与开放问题

1. **双 API 面并存的选择**：V2 protocol（只读 list）与 legacy instance HttpApi（含全部写路径）并存是当前上游事实。本模块决策：读走 V2（与 server-sync 状态层一致），写走 legacy（唯一已验证通道），新增仅 `researchos-assets` group。风险：上游 v2 迁移推进后 legacy 面可能下线——届时把 config_patch/mcp 双写迁移到 v2 等价 endpoint，前端封装集中在 `api.ts` 一处，迁移成本可控。
2. **MCP add 的 runtime 与持久化一致性**：`POST /mcp` 不持久化，双写存在"config 成功 / runtime 失败"中间态。处理：先持久化后 runtime add，失败保留 config 并如实提示（重启后生效）；不做反向回滚（用户可能想稍后手动 connect）。
3. **项目级 config 写回的格式问题**：`Config.update` 写 `<project>/config.json` 且整体 JSON 重写（丢 jsonc 注释），与课题惯例 `opencode.json(c)` 不一致（见 §6.4）。决策：MCP/plugin 写回绕过 `PATCH /config`，由 handler 用 `jsonc-parser` 局部改写 `opencode.json(c)`。开放问题：若课题同时存在 `config.json` 与 `opencode.json`，合并优先级以原生加载顺序为准，写入目标需与原生保持一致——实现时以 `loadInstanceState` 的实际文件选择逻辑为准核对。
4. **文件类资产的热重载**：Skill/Agent/Command 的 InstanceState 无 watcher 订阅，写完文件未必即时生效（§6.3 开放问题）。首版保底：handler 返回 `reloaded` 标志，前端在 `false` 时提示"保存成功，新会话生效"。
5. **composer 改动属高冲突侵入点**：composer/prompt-input-v2 是上游 v2 迁移活跃区。纪律：改动全部 `researchos:start/end` 包裹、集中于最少 hunk，登记进《代码结构与上游同步.md》§3.2 与 §5.3 热点清单，季度审计数量不膨胀。
6. **preset 包版本漂移**：preset 安装是文件拷贝，ResearchOS 升级后旧课题内的 preset 资产不会自动更新。开放问题：是否在资产中心对 preset 来源资产显示"有新版本"徽标（比对 `@researchos/preset` 包内文件 hash 与 `preset_install.files`）——首版不做，记录在案。
7. **`@文献`/`@数据集` 的跨模块依赖**：mention 源依赖模块一/四的 protocol group；首版按可选降级实现（源未注册则跳过），不阻塞本模块交付。
8. **Rules 多源合并语义**：AGENTS.md 存在"向上发现 + 全局 + config `instructions` 键"三源（`core/src/instruction-context.ts`），编辑器的"当前生效范围"标注若与实际注入不符会误导用户。实现时以 instruction-context 的真实合并顺序为准渲染 chain，不做超出其语义的"编辑全局/课题"以外操作。
