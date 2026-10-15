# ResearchOS 产品与 UI 融合设计：研究台 × 对话

## 一、问题诊断：为什么现在"割裂"

1. **双世界双导航**：会话页（`/:dir/session/:id`）走 LegacyLayout 的会话侧栏；研究模块（`/:dir/<module>`）走 ResearchosWorkspace 的模块导航。用户在两个世界之间跳跃，没有统一的空间感。
2. **对话是"目的地"而非"伴随"**：问一个关于当前论文的问题，必须离开文献页、进入会话页。AgentDock 是桥梁但只渡一次——发送即跳走。
3. **研究对象不是对话的一等上下文**：论文、图谱节点、数据集无法被会话引用（@提及不存在；MCP 工具需手动启用）。
4. **会话与研究对象互不知晓**：为一篇论文做过的"阅读笔记会话""问答会话"，在论文详情页看不见；会话也不知道自己在为哪篇论文服务。

已有的地基（前期已交付）：shell-context（`agent`/`dockOpen`）、paper-context 真实注入（system + PDF 附件）、Library-only 开关、Reading note 闭环、资产页一键启用 MCP。本设计在这些地基上做结构融合。

## 二、产品模型：一个项目 = 一个研究台，对话始终伴随

**核心主张**：对话不再是独立的"页"，而是研究台的伴随能力；研究模块不再是孤立的"功能页"，而是对话的工作对象。

### 对话三态

| 态 | 形态 | 适用 |
|---|---|---|
| 伴随 | AgentDock 内联在研究模块底部，持久会话、可发可收 | 快速提问、论文问答、起草 |
| 聚焦 | 全页会话视图（现有 session 页） | 长任务、多轮深入、审阅 diff |
| 后台 | agent 执行长任务时收缩为状态栏条目 | 批量导入分析、复现运行 |

三态是同一个会话的不同呈现，可互相升级/降级（Dock "Open full chat" → 聚焦；聚焦页回到模块 → 伴随保留）。

### 研究对象 = 一等上下文

- 论文/图谱节点/数据集在对话中可被引用：本期经 Dock 自动注入（已交付），后续期做 `@paper` 提及（见 P3）。
- 会话可关联研究对象：论文详情页可见"相关会话"（阅读笔记、问答），点击即回到该会话。

### 统一空间

```text
┌──────────────┬────────────────────────────┬──────────────┐
│ 统一导航 rail │      当前模块工作区          │  上下文面板    │
│ ─ 模块(固定)  │   （文献/图谱/LaTeX/…）      │ （证据/产物）  │
│ ─ 会话(项目)  │                            │              │
│   · 最近会话  │                            │              │
│   · 新建对话  │                            │              │
├──────────────┴────────────────────────────┴──────────────┤
│ Agent Dock（伴随对话，默认折叠）                            │
│ 状态栏（backend · graph · mcp · api）                       │
└──────────────────────────────────────────────────────────┘
```

会话列表与模块在同一 rail：模块在上（工作对象），会话在下（进行中的思考），一条导航内完成一切切换。全页会话视图保留，但从 rail 进入、随时回到模块不丢上下文。

## 三、关键任务流（融合后）

1. **论文问答**：文献页选中论文 → Dock 提问（上下文自动注入）→ 回答内联出现 → 想深入点 "Open full chat" → 全页继续，上下文无损。
2. **入库首读**：导入 → 详情页 "Reading note" → agent 读 PDF 写 `notes/literature/<id>.md` → Build graph → 图谱出现笔记节点并与论文关联。
3. **库级问答**：任意会话（rail 新建）→ 模型经已启用的 literature/graph MCP 工具检索文献库 → 回答标注 cite key → 可存笔记回流图谱。
4. **写作引用**：LaTeX 页 → Dock 问"帮我引证 X 结论"→ 模型查库给出 cite key → 插入引用（现有 writing/bibtex 端点）。

## 四、实施分期

| 期 | 内容 | 性质 | 状态 |
|---|---|---|---|
| P1 | 统一导航 rail：模块 + 项目会话列表 + 新建对话 | 纯前端，壳层改造 | 已交付（2026-08） |
| P2 | Dock 成为真对话：持久会话（按项目+模块记忆）、内联消息流、Open full chat / New chat | 纯前端 | 已交付（2026-08） |
| P3 | ~~论文详情"相关会话"互链~~；~~`@paper` 提及进 composer~~ | 前端 + prompt-input 扩展 | 已交付（2026-08） |
| P4 | 协议补 `citeKey`/`pdf_path`；install 端点落 agents；SystemContext 库/选中源（即联动方案 L2） | 后端 | 未开始 |

完成定义沿用既有纪律：页面合入 + 后端真实可用 + 端到端验收 + 缺依赖/失败有界面 + 本文档打勾。

### 布局演进记录（2026-08，原生融合）

P1 的"工作区自带 rail"已被原生融合取代：研究模块不再自带内部导航，模块切换与会话列表统一由原生侧栏承担——图标 rail（`ResearchosModuleRail`，任意页面可直达、当前模块高亮、项目无关页隐藏）+ 面板 Research 分区（`ResearchosModuleList`，带真实模块计数）+ 原生会话列表（会话条目显示真实作用域标签，来自 dock/paperSessions 索引的反向查询）。工作区壳层只保留内容区、右侧上下文面板、Agent Dock、状态栏。

### 原型对齐记录（2026-08，对照 artifacts/researchos-ui/fusion.html）

- **相关会话**：`paper-context.ts` 新增 `recordPaperSession`/`readPaperSessions`（localStorage 索引，dock 会话与 reading-note 会话创建时登记）；文献详情 "Related chats" 区块按索引关联会话 store，显示标题 + 相对时间，点击直达会话，已删会话自动剔除。
- **AI 阅读笔记展示**：详情页读取 `notes/literature/<paperId>.md`（`file.read`），按 `##/###` 分节渲染笔记块，附 mono 来源行；文件不存在/读取失败静默不渲染，不伪造。
- **右侧上下文面板**：文献页接入 `setContextPanel`——Destinations（graph/latex/translate 跳转，带模块徽章）+ Files（归档 PDF 与阅读笔记的真实路径，存在才显示）。
- **Open in graph 定位**：详情页跳转携带 `?paper=<id>`；图谱页按真实关联字段 `node.refId`（= 文献 paper id，见 `store.ts:319`）匹配 paper 节点，选中 + 复用 `focusRequest` 居中；未匹配显示"先 Build graph"提示与动作，不伪造选中。
- **@paper composer 提及**（P3 收尾）：`@` 自动补全新增 paper 选项组（文献库真实列表，标题 + `id · year` 描述），选中后有归档 PDF 的论文附加 PDF file part（复用现有 file part 管道，服务端 read 直接喂给模型），无 PDF 的论文插入真实元数据文本（标题/id/年份/摘要截断），不伪造内容。改动以 researchos 标记包裹于上游文件（prompt-input.tsx / slash-popover.tsx）。
- **侧栏真实计数**：`counts.ts` 共享探测（allSettled，60s 重取），Research 分区模块显示真实计数，失败探测不渲染。
- **会话作用域标签**：`session-scope.ts` 反查 localStorage 索引（dockSession + paperSessions），原生会话条目显示真实模块标签（2s TTL 缓存）。
- **ModuleState 清扫**：data 页与 reproduce 页的顶层加载/错误/空态统一至 ModuleState；translate/latex/plot/dashboard 经评估属局部状态或多面板结构，刻意保留并记录理由。

### 已交付记录

- **P1（`researchos-workspace.tsx`）**：rail 分为 Modules（固定）与 Chats（项目会话）两区。会话数据复用 server-sync 的 per-directory 子 store（与主侧栏同源，`sortedRootSessions` 过滤子会话/归档、按更新时间排序，取前 8），相对时间用 luxon `toRelative()`；"New chat"/"All sessions" 直达会话路由；空态提示"No chats yet — ask from the dock below."。
- **P2（`agent-dock.tsx` 重写）**：Dock 升级为伴随态真对话——会话按 `${directory}:${module}:${resource ?? "general"}` 持久化在 localStorage，换论文即切换到该论文的专属会话；内联文字消息流（user/assistant 文本部分，100 条上限，3s 轮询，自动滚底，"Thinking…"提示）；发送不再跳走；"Open full chat" 升级聚焦态，"New chat" 重开；已存会话被删时静默重置。论文上下文注入（system + PDF 附件 + Library-only）保持原样接入持久会话。
- 浏览器端到端验收待补（需真实后端 + Playwright 环境）；P1/P2 均为 typecheck 通过 + 单测基线（628 pass / 1 既有 i18n 失败）。

## 五、明确不做的

- 不重写 session 全页视图（上游同步敏感区），融合发生在壳层与 Dock；
- 不在 Dock 内联渲染完整富文本消息（diff/工具块等），伴随态只渲染文本主体，复杂内容去聚焦态看；
- 不做跨项目会话聚合——会话始终归属当前项目目录。
