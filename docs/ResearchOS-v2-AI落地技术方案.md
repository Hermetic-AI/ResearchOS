# ResearchOS v2 · AI 落地技术方案

> 结合当前代码（opencode 基座 + researchos-* 领域包）、原型 v2.1 的创新交互，明确 AI 运行时的架构、技术选型、数据流与缺口。本文只讲"AI 能力如何落地"，客户端与打包见重构总计划。

## 0. 现状盘点：哪些 AI 能力已经在跑

| 能力 | 现状实现 | 可复用度 |
|---|---|---|
| 文本嵌入 | `researchos-literature/src/embed.ts`：`Xenova/bge-small-en-v1.5`（384 维，mean pooling + normalize），transformers.js 动态加载、首载 ~100MB 缓存到 `models/` | 高，直接迁入 |
| 向量检索 | `sqlite-vec` 的 `vec0` 虚拟表（`db.ts:37-38` 摘要/分段双表；`researchos-graph/src/store.ts:96` 节点表）；L2 距离归一 `1/(1+d)`（`recommend.ts:48`） | 高 |
| 检索降级 | vec0/嵌入模型不可用时整体降级 FTS5/关键词，返回 `degraded:true`，agent 被要求向用户说明（`literature.md:30`、`graph.md:31`、`graph-rag/SKILL.md:11`） | 高，作为可靠性契约保留 |
| Graph RAG | `researchos-graph`：`node_fts`(fts5) + `node_vec`(vec0) 混合召回，产出 `contextPack`（`types.ts:45`） | 高 |
| 科研上下文注入 | `core/src/researchos-context.ts`：读 `.researchos/literature/literature.db` + `.researchos/selection.json`，经 SystemContext 注册 `researchos/library`、`researchos/selection` 两个源，动态渲染进 system prompt | 中，逻辑复用、宿主换 |
| PDF 全文 | `researchos-literature/src/pdf/`：extract + GROBID 解析 + 引用抽取 + 语义分段（`paper_chunk`） | 高 |
| 多源检索 | `researchos-api-hub/src/adapters/`：arXiv/SemanticScholar/CrossRef/PubMed，含限速/重试/缓存 | 高 |
| 工具面 | 4 个 Python MCP server（literature/data/translate/graph）+ TS plugin 工具（writing/plot-core） | 高，stdio 挂载不变 |
| 实验溯源 | `researchos-data`：`link_experiment` 产物↔git HEADLaTeX 章节回溯 | 中，需扩展为统一事件流 |

**结论**：AI 的"领域大脑"（嵌入、检索、RAG、解析、多源、工具）与 opencode 框架耦合很浅，几乎全部可平移。真正要重建的是**运行时骨架**（agent 循环、provider、事件、权限、技能装载）和**原型新增的三类数据结构**（假设、溯源事件、边注）。

## 1. 目标架构

```
ros/core-agent  ── 会话状态机 + tool-calling 循环 + 上下文编排 + 技能装载 + 权限
   ├─ provider   OpenAI/Anthropic 兼容适配，流式，模型路由（fast/deep）
   ├─ tools      ToolRegistry：内置工具 + MCP 工具统一 zod schema
   ├─ rag        嵌入 + vec0/FTS 混合检索（封装现有 embed/recommend/graph）
   ├─ context    ResearchContext：当前论文/假设/文献库快照 → system prompt
   └─ events     溯源事件总线（append-only）
ros/server  ── Bun HTTP + SSE，/api/threads /api/skills /api/trace /api/hypotheses ...
ros/db      ── ros.db（中心：projects/threads/messages/hypotheses/trace_events/skills）
领域包(ros/pkgs) ── literature/data/translate/graph/latex/plot/reproduce/writing/api-hub/preset（原样迁入）
```

依赖方向：`core-agent → 领域包 → api-hub`；`server → core-agent`；前端只依赖 `server` 的 HTTP/SSE，不触碰运行时。

## 2. Agent 运行时（新建，替换 opencode session 内核）

### 2.1 tool-calling 循环
- 一次 provider turn 显式一次 `provider.stream(request)`；工具结果回填后 reload 投影历史再续跑（保留 opencode V2 "每轮一次显式调用"的纪律，去掉其 Effect 重型骨架）。
- 终止条件：模型无 tool_call、或达到 maxSteps、或用户中断。中断为进程内 no-op，不落脏状态。
- 循环状态持久化到 `messages` 表，重启可恢复（P1 验收项）。

### 2.2 上下文编排（ResearchContext）
把 `researchos-context.ts` 的两个源泛化为可插拔 ContextSource：
- `library`（库规模/集合/最近导入）、`selection`（当前论文）、**新增** `hypothesis`（激活假设 H 及其证据/反例计数）、`skill`（本回合已注入的技能正文清单）。
- 渲染策略沿用 baseline/update/removed 三段式，避免每轮重复整段；变更才发增量描述。
- 每个 ContextSource 有 `degraded` 感知：向量降级时在 prompt 注入"当前为关键词召回"提示，延续现有契约。

### 2.3 模型路由
`core-config` 声明 `fast`/`deep`/`embed` 三档；对话默认 fast，"精读推导/统计解释/复现诊断"由 persona 或 `deep` 标记切换。嵌入固定本地 `bge-small`，不走出网成本。

## 3. RAG 与检索落地

- **统一检索门面** `core-agent/rag`：`query(text, scope)` → 归一化向量 → vec0 KNN topK → 命中不足或 `degraded` 时并跑 FTS5 融合。封装现有 `recommend.ts`/`store.ts`，不重写算法。
- **三种召回作用域**对应原型三处入口：
  - 库级问答（对话）→ paper_chunk 向量 + 引文共现加权；
  - 单篇语义分段（边注阅读器/详情面板）→ `paper_chunk_embedding`；
  - 星图"向宇宙提问"→ 跨 paper_embedding + node_vec + 外部 api-hub 联邦检索（见 §5.1）。
- **引用可溯源**：每个召回片段携带 `{paperId, section, page, chunkId}`，回答侧强制标注，前端 `[n]` 悬浮卡与边注锚点据此渲染（见 §5.2/§5.4）。
- **可靠性**：sqlite-vec 加载失败是常态分支不是异常——保留 try 降级、UI 显示"关键词模式"、绝不把降级结果包装成语义结果。

## 4. 技能系统（SKILL）落地

- **装载器** `core-agent/skills`：扫描 `.opencode/skills/<name>/SKILL.md`（项目）+ `~/.config/opencode/skills/`（全局），兼容 `.claude/skills`、`.agents/skills`。解析 frontmatter：`name/description/tools/triggers`。
- **渐进披露**：常驻 system prompt 的仅 `name+description`（~40 tok/技能）；正文在三种触发下才注入当回合：
  1. 用户 `/skill-name`；
  2. 用户 `@skill`（composer 选择，见 chat 原型浮层）；
  3. agent 依 description 判定相关，主动 `load_skill` 工具调用。
- **当回合注入 + 持久化**：注入的正文作为一条 `skill_load` 消息事件落库（记 `skill, tokens, turn`），进溯源时间轴，且下一回合默认不重复携带（除非再次触发）——控制上下文膨胀。
- **上传安装**：`POST /api/skills/install`：暂存区解压 → 校验 frontmatter 合法/工具依赖已注册/无越权声明（shell/网络）→ 落项目或全局目录 → 写 `skills` 表（enabled/scope/version）。校验失败返回逐条清单（对应 skills.html 弹窗）。
- **双引擎过渡**：目录与 opencode 一致，重写期新旧运行时读同一份技能，安装一次两边可用。

## 5. 原型创新 → 后端能力映射（含缺口）

### 5.1 文献星图 · 假设画布（index.html）
- **星图**：`researchos-graph` 已具节点/边 + 向量。缺：**布局与聚类**。落地：paper_embedding 离线 KMeans/UMAP 降维打簇标签（存 `nodes.cluster`），前端 d3-force 定位（已有 `graph-canvas.tsx`）。跨簇虚线 = 共引边。
- **假设节点 H1/H2/H3**：★全新数据。`hypotheses` 表：`{id, project_id, statement, status(draft/verifying/refuted/confirmed), created_by}`；`hypothesis_evidence`：`{hypothesis_id, kind(pro/con/experiment), ref_type(paper|chunk|artifact|message), ref_id, note}`。agent 动作"转为假设 H"写入；"跑检验"关联 notebook 产物并回填结论。缺：**证伪联动**——H 被推翻时遍历 `hypothesis_evidence` 标记依赖产物 `needs_review`（trace.html 底部反事实条）。

### 5.2 边注共生阅读（reading.html）
- **锚点模型**：★全新。`annotations` 表：`{id, paper_id, page, para, quote, type(question/extend/verify/translate), agent, body, reasoning(JSON), created_at}`。quote + (page,para) 定位，GROBID 分段保证可回跳。
- **推理链**：`reasoning` 存 `{retrieved:[{ref,snippet}], artifacts:[...], steps:[...]}`——即一次受限 RAG 子运行的轨迹，直接复用 §3 召回门面。
- **选区→提问**：前端选区带 quote 调 `POST /api/annotations`，后端注入该论文 `paper_chunk` 上下文生成边注（非全库检索，降延迟）。
- 缺：现有 PDF 附件注入是"整篇喂模型"；落地需改为**按边注锚点局部检索**，避免超窗。

### 5.3 研究溯源时间轴（trace.html）
- **统一事件流**：★核心新建。`trace_events` append-only 表：`{id, project_id, ts, kind(chat|ingest|parse|notebook|commit|compile|graph|translate|skill_load), subject_ref, summary, payload(JSON)}`。
- **写入点**（横切）：对话产出结论、文献入库、GROBID 解析、notebook cell 运行、git commit、LaTeX 编译、图谱重建、技能注入——各 API handler 成功后 append 一条。
- **溯源链**：给定产物反查链 = 沿 `payload.causal[]`（存上游 event_id）递归；`link_experiment` 的 产物↔gitLaTeX 作为其中三类边并入。
- **重放**：只读回放事件序列（不重跑模型），"导出 bibtex+diff" 由链上 commit/文献节点聚合。
- 缺：现在只有 `researchos-data` 局部链；需把 chat/latex/graph 的写入点统一接进事件总线。

### 5.4 课题组多 agent（workbench.html）
- **作业模型**：`tasks` 表：`{id, project_id, persona, goal, status(running/awaiting_approval/done/failed/queued), parent_task_id, progress, log[]}`。长任务后台跑，SSE 推进度。
- **spawn_subagent**：主 agent 依 persona 白名单派生受限子循环（复用 §2.1，换 system prompt + 工具集）。8 persona 来自 `researchos-preset/agent/*.md`，frontmatter 的 `permission` 映射到 §6。
- **插话改方向**：向运行中 task 追加 steer 消息，下个安全边界并入（保留 opencode "steer 在 provider-turn 边界提升"语义）。
- **批准写入**：`awaiting_approval` 态 + 权限门（§6）触发朱红"批准写入"。

### 5.5 论文式回答（chat.html）
- 纯 prompt 工程：persona system 要求"结论先行→编号论点→上标引用→脚注区"，引用必须来自 RAG 命中的 `{ref}`；前端按结构渲染悬浮卡与溯源链。缺：**结构化输出约束**——用 provider 的 JSON/工具模式产出 `{claims:[{text,cites:[]}], footnotes:[]}` 再排版，避免正文与引用错位。

## 6. 权限与安全

- 两级：`readonly` 自动放行；`approve-write`（写文件/shell/网络）挂起等确认，规则可持久化（`permissions` 表）。
- MCP 工具继承 persona 白名单：literature.* 默认 allow、shell.exec 默认 deny（沿用 preset frontmatter）。
- 技能越权声明在**安装期**拦截（§4），运行期工具调用再过权限门——双保险。
- 密钥仅存本地 `researchos.config.json`/系统 keychain，日志脱敏 `sk-****`。

## 7. 分阶段落地（AI 视角）

| 阶段 | AI 交付 | 验收 |
|---|---|---|
| P1 | core-agent 循环 + provider + SSE + ResearchContext(library/selection) | 配 OpenAI 兼容 key 完成含 1 内置工具的多轮流式对话，重启可恢复 |
| P2 | rag 门面（vec0+FTS 降级）+ 4 MCP 挂载 + api-hub 迁入 | smoke：arXiv 检索→GROBID 入库→分段召回→翻译一章→MCP 出图，全链 `degraded` 正确上报 |
| P2.5 | **技能装载器 + `/api/skills` + 渐进披露注入** | 上传 zip→校验→安装；`@skill` 当回合注入并落 `skill_load` 事件，下回合不重复 |
| P3 | **hypotheses + annotations + trace_events 三张新表 + 写入点** | 星图聚类可见；边注可回跳；任一产物可展完整溯源链；H 推翻触发 needs_review |
| P3.5 | **tasks + spawn_subagent + 结构化回答** | 2 个 persona 并行后台作业、插话生效、写操作走审批；回答引用可点 |
| P4 | 模型路由 fast/deep + 成本/延迟埋点 | 精读走 deep、闲聊走 fast，token 统计入 trace |

## 8. 关键风险

1. **上下文膨胀**：多源注入 + 技能正文 + 论文全文极易超窗。缓解：渐进披露、按锚点局部检索（§5.2）、baseline/update 增量、分段摘要缓存。
2. **嵌入首载 100MB/离线**：transformers.js 冷启动慢。缓解：常驻 warm 进程或首帧异步、期间一律走 FTS 降级并标注。
3. **GROBID 依赖**：无服务时全文/边注锚点退化。缓解：doctor 探测，缺服务则边注仅支持元数据级引用。
4. **降级不可见**：向量/FTS 降级若不在 UI 明示会误导用户。缓解：`degraded` 作为一等字段贯穿 tool→prompt→前端徽章（现契约，必须保留）。
5. **溯源写入遗漏**：横切事件易漏埋点。缓解：事件 append 收敛到 handler 统一包装层，新增能力默认产事件。

## 9. 复用清单（不重写的部分）

`embed.ts` / `recommend.ts` / `db.ts(vec0)` / `researchos-graph/store.ts` / `pdf/*` / `researchos-api-hub/adapters` / 4 个 `researchos-mcp/*` / `researchos-preset/{agent,skill,command}` / `link_experiment` / `researchos-context.ts`(改宿主)。
