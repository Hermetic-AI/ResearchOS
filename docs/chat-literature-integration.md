# 对话 × 论文管理联动设计方案

## 〇、现状诊断（先回答四个问题）

### 1. 为什么 PDF 上传不支持多选

三层都按单文件写的，不是故意的限制：

- 前端 `literature.tsx` 的 `<input type="file">` 没有 `multiple`，只取 `files[0]`；
- 协议 `ImportPayload`（`packages/protocol/src/groups/researchos-literature.ts:31`）每个字段都是单值可选标量；
- 服务端 handler（`packages/server/src/handlers/researchos-literature.ts:41`）一次调用只处理一个 PDF。

前端循环调用即可实现多选（本轮已修）；真正的批量端点（一次请求传多个文件、服务端排队+逐文件结果）留作后续协议演进。

### 2. 论文管理和对话现在是什么关系

几乎没关系。全部桥梁只有两处：

- **AgentDock 文本前缀**：`agent-dock.tsx` 创建会话时只在首条用户消息前拼一行 `[ResearchOS module: literature · resource: <id>]` 纯文本，不含任何论文数据；
- **MCP 预设**：`packages/researchos-mcp`（literature/graph 等 7 个 MCP server + 8 个 agent）存在，安装端点 `POST /api/researchos-assets/install` 也存在，但**前端没有任何入口调用它**——用户不手工改配置就用不上。

`packages/opencode` 会话核心对 researchos 数据零引用。确认：**当前是割裂的**。

### 3. 论文解析是 RAG 分片还是 llm-wiki

**都不是**。现状：

- 导入：pdfjs 提取全文 → 首页/前三页解析元数据（DOI/arXiv/标题）→ Crossref/S2 在线富化 → GROBID 或规则解析参考文献 → 写入 SQLite（元数据、引用边、摘要向量）。**全文提取后即丢弃，不落盘**。
- 图谱 RAG（`/api/graph/ask`）：只索引 `.md/.tex/.latex` 文件，**整文件粒度，无分片**；不读 PDF，不读文献库内容。
- 向量路径存在但被强制禁用：handler 硬编码 `{ vecAvailable: false, knn: () => [] }` 且 embedder 传 `null`（`researchos-graph.ts:47`），所以 ask 永远走 FTS 关键词降级；`answer` 硬编码为空串，只返回 seeds/subgraph/contextPack，没有 LLM 综合。

### 4. 已有的可复用机制（设计方案的地基）

| 机制 | 位置 | 能做什么 |
|---|---|---|
| `PromptInput.system` 字段 | `packages/opencode/src/session/prompt.ts:1510` | 单条消息附带系统级上下文，V1 路径（app 实际使用）已生效 |
| file part + read 工具 | `prompt.ts:808`、`tool/read.ts:306` | `file://` 部分服务端落盘读取；read 工具可直接把 PDF 作为 base64 附件喂给模型 |
| MCP 运行时 | `packages/opencode/src/mcp/`、`session/tools.ts:390` | V1 会话内 MCP 工具完整可用、权限门控 |
| SystemContextRegistry + ContextEpoch | `packages/core/src/system-context/`、`session/context-epoch.ts` | V2 设计好的注入点：注册 `Source`（baseline/update/removed），每轮 reconcile，diff 以 system 消息持久化进历史 |

## 一、设计原则

1. **检索策略：agentic retrieval 为主，注入为辅**（即用户所说的 llm-wiki 思想）。模型通过工具按需检索文献库（搜索、取元数据、取引用、读 PDF），而不是把语料预先分片塞进上下文。理由：单项目论文量级（几十到几百篇）下，元数据+引用边+按需读原文的精度高于盲目 chunk；且 read 工具已能直接读 PDF。
2. **注入式 context 只承载"当前焦点"**：用户正在看哪篇论文、库的整体轮廓（数量、最近导入）。这部分走 SystemContext，随每轮 reconcile 自动保鲜。
3. **分片向量化是可选加速层，不是前提**：先在导入时把全文落盘为 txt（当前直接丢弃），让 grep/read 可用；语义检索复用已有 sqlite-vec 设施后续再开。
4. **遵守实施纪律**：一次一个纵切片；每个能力暴露真实状态与降级；不产生无出处的"证据"。

## 二、分层方案

### L0 即时联动（无协议变更，纯前端 + 现有端点）

1. **多选导入**（已交付）：文件输入加 `multiple`，前端逐文件循环调用现有 import 端点，进度可见、单文件失败不中断、失败保留选择可重试。
2. **"问问"模式（借鉴 ima：文档页本身就是对话入口）**：文献详情页常驻提问入口（动作区主操作 + AgentDock 预填），用户不需要"去对话页"。注入真实上下文（替换裸文本前缀）：
   - 从 `researchos-literature` 详情端点取当前论文（标题、作者、摘要、cite key、年份）；
   - 首条消息带 `system` 字段：`You are assisting with the paper "<title>" (<citeKey>, <year>). Abstract: ... The user is viewing it in the ResearchOS literature module.`；
   - 附带 `file://<projectRoot>/.researchos/literature/pdfs/<year>/<id>.pdf` 文件部分——服务端 read 会把 PDF 直接喂给模型，实现"对当前论文全文提问"；
   - 无选中论文时退化为库摘要（数量 + 最近 5 篇标题），不含伪造内容。
3. **入库即首读（借鉴 ima 的 AI first pass）**：导入成功后自动生成论文摘要（中文）+ 3 个延伸问题，展示在详情页并持久化（写入 `.researchos/literature/notes/<paperId>.md` 或库字段）。生成走真实会话/模型调用；模型不可用或失败时显示 `degraded` 态与重试，**不伪造摘要**。
4. **搜-读-写-存闭环（借鉴 ima）**：论文相关回答可一键"存为笔记"——写成项目内 `.md`（含 cite key wikilink），随后被现有 graph reindex 自然索引并与论文节点关联。闭环全部复用已有管道，不建新存储。

验收：在文献页选中一篇已归档 PDF 的论文 → 提问 → 会话内模型能引用摘要并回答全文细节（如方法小节内容）；回答存为笔记后图谱中可见关联节点。

### L1 工具化检索（会话内 literature 工具）

资产中心新增 **"Enable research tools in chat"** 动作：

1. 调用已存在的 `POST /api/researchos-assets/install`（pack `researchos-mcp`）写入项目 opencode 配置；
2. 触发 MCP 连接测试，结果走已有的保存/连接两步状态展示（保存成功 ≠ 连接成功）；
3. 已启用时在状态栏/资产页显示各 server 工具数与最后错误。

此后任意会话可用 `literature_search / get_metadata / get_citations / recommend_similar / import_pdf` 等工具——模型自己决定何时检索，这是联动的主干道。

**来源作用域（借鉴 ima 的"基于知识库 / 基于全网"切换）**：AgentDock 提供"仅基于文献库"开关——开启时 system 约束模型只用 literature/graph 工具回答并标注出处（论文 cite key），关闭时模型自由使用全部工具。用户每问一个问题都显式选择知识来源。

验收：启用后在新会话问"我库里关于 X 的论文有哪些，引用关系如何"，模型通过 MCP 工具返回真实库数据（可对照文献页列表）。

### L2 服务端上下文源（V2 SystemContext）

注册两个 Location 作用域的 Source（模式照 `instruction-context.ts`）：

- `researchos/library`：load 读 `.researchos/literature/literature.db`（只读），baseline 渲染库轮廓（论文数、collection 分布、最近导入 5 篇）；库变化时 reconcile 自动产生 diff system 消息。会话因此始终"知道"库的现状，无需用户粘贴。
- `researchos/selection`：当前焦点论文。前端 AgentDock/详情页通过一个轻量端点（或复用 L0 的 system 字段方案）上报；V2 会话每轮注入。注：V2 的 `PromptInput.Prompt` 目前无 system 字段，selection 源是 V2 下的正解；V1 路径用 L0 的 system 字段即可，两者不冲突。

验收：导入一篇新论文后，进行中的会话下一轮能感知"库新增了 X"（diff 消息），无需重开对话。

### L3 深度阅读层（可选加速，按需开启）

1. **全文落盘**：import 流程把 pdfjs 提取的全文写到 `.researchos/literature/text/<paperId>.txt`（当前丢弃）。grep/read 立即可用，也为向量化备料。
2. **语义检索**：章节级分片 + bge-small 嵌入进 `paper_embedding` 同款 vec0 表；暴露为 `literature_read <paperId> <query>` MCP 工具——模型问"这篇论文的实验设置"时先取向量命中的章节，不够再读全文。
3. **解开 graph ask 的向量禁用**：embedder 可用时去掉 handler 的强制降级；不可用时保持 FTS 降级明示（现状的诚实展示已就位）。

验收：对 50 篇以上库提问跨论文主题，模型经 `literature_read` 返回带章节出处的答案；embedder 缺失时界面明示降级而非静默。

## 三、从 ima.copilot 学到的交互范式（及学不到的部分）

**能学的**：ima 的产品与交互设计（公开评测详实）。它让知识库与对话不割裂靠四点：

1. 知识库是对话的**作用域**而非另一个应用——提问入口显式切换"基于知识库 / 基于全网"；
2. **文档页本身就是对话入口**——"问问 ima"悬浮于每个阅读界面，不需要"去对话页"；
3. **入库即首读**——文档入库时 AI 自动生成摘要、脑图、延伸问题，索引不只是"存起来等检索"；
4. **搜-读-写-存闭环**——回答/脑图一键存为笔记，笔记回流为知识库语料，知识双向流动。

以上四点已分别吸收进 L0（2/3/4）与 L1（1）。

**学不到的**：ima 未开源，分片策略、嵌入模型、检索排序等内部实现无公开资料；腾讯开源的同架构产品 WeKnora（RAG + 知识图谱）可作技术参照，但属旁证而非 ima 本身。ima 的微信生态数据源（公众号信源、聊天导入）是平台红利，不属于可移植设计，本方案不纳入。

## 四、明确不做的

- 不建独立的"论文聊天机器人"页面——联动发生在统一会话与 AgentDock 里；
- 不在 L0/L1 做全文分片入库——agentic 检索 + PDF 直读先验证真实任务完成率；
- 不为抹平差异而隐藏降级——FTS/向量、GROBID/规则解析的差异继续显式展示；
- 不伪造"入库首读"产物——模型不可用时显示降级态与重试，绝不生成无出处的摘要。

## 五、交付顺序与完成定义

| 切片 | 内容 | 完成定义 |
|---|---|---|
| L0 | ~~多选导入~~；~~问问模式 + 真实上下文注入~~；~~入库即首读~~（务实版）；~~存笔记闭环~~（已实现，见注） | 浏览器端到端：选论文 → 提问 → 回答含全文细节；笔记入库后图谱可见关联 |
| L1 | ~~资产页一键启用 researchos MCP + 连接状态~~；~~仅基于文献库开关~~ | 会话内工具调用返回真实库数据；作用域开关约束生效可验证 |
| L2 | ~~`researchos/library` + `researchos/selection` 上下文源~~ | 库变更在既有会话下一轮可见（diff system 消息） |
| L3 | ~~全文落盘~~；~~章节向量~~；~~graph ask 解禁~~ | 章节级出处答案；降级显式 |

### 已交付记录（2026-08）

- **多选导入**：`literature.tsx` 文件输入支持 `multiple`，前端逐文件循环导入，进度可见、单文件失败不中断、失败保留选择可重试。
- **问问模式 + 真实上下文注入**：`paper-context.ts` + `agent-dock.tsx`——选中文献后 Dock 发送时自动注入论文标题/作者/摘要（`system` 字段，SDK 类型原生支持）+ 归档 PDF 的 `file://` 附件（经 `file.list` 在 `.researchos/literature/pdfs/<year|unknown>/` 定位）；文献详情新增 "Ask agent"（展开 Dock 并预置上下文）。已知限制：协议 `Paper` 无 `citeKey`/`pdf_path` 字段，PDF 靠目录约定定位，cite key 以论文 id 代替——如需真实 BibTeX key 需协议演进。
- **仅基于文献库开关**：Dock 内 "Library only" 复选框，开启时 system 约束模型只用文献库/图谱来源并标注出处。
- **入库即首读（务实版）**：详情页 "Reading note" 动作创建会话，模型读 PDF 后用 write 工具把结构化中文阅读笔记写入项目根 `notes/literature/<paperId>.md`（`.researchos/` 被图谱排除，故放项目根），随后 Build graph 即可索引关联。未做"导入后全自动生成"：批量导入 N 篇会产生 N 个会话，成本不可控，保持手动逐篇触发。
- **存笔记闭环**：经上一条实现（回答→`.md`→graph reindex 索引）。通用的"任意会话回答一键存笔记"需改 session 页面，暂缓。
- **graph ask 向量解禁**：`GraphRepository` 增加可选向量成员（`vecAvailable`/`hasEmbedding`/`upsertEmbedding`/`knn`，sqlite 后端透传 `SqliteStore`，Bolt 后端保持 FTS-only）；`graph.reindex` 与 MCP `upsert` 后经 `embedGraphNodes` 批量回填节点嵌入（label+属性，2000 字符截断，32/批，失败静默降级）；`graph.ask` 与 graph MCP server 去掉硬编码 `vecAvailable: false`，改为真实 repository + 按 location 缓存的 `createEmbedder`。embedder/vec 不可用时 `recallSeeds` 仍走 FTS 且 `degraded: true` 明示；`answer: ""` 设计不变（回答由调用方生成）。修复 `SqliteStore.hasEmbedding` 用 `!== undefined` 判 `.get()` 空值的 bug（bun:sqlite 返回 `null`）。
- **L3（部分）：RAG 化论文问答，去掉 PDF 直投**：导入时全文落盘 `.researchos/literature/text/<paperId>.txt` 并做章节感知分片 + 384 维向量入库（`paper_chunk` / `paper_chunk_embedding`，`packages/researchos-literature/src/chunk.ts`、`service.ts` `indexFullText`）；新增 `LiteratureService.read(paperId, query)`（惰性回填 + 语义 KNN + 关键词降级 `degraded` 明示），经三路暴露：CLI `read` 命令、MCP 工具 `literature_read`（含 preset agent 权限）、HTTP `POST /api/literature/papers/:id/read`。前端 ask 流程不再附件 PDF：Dock 提问时先经 `literature.read` 取 top-k 章节作为 text part 注入（带出处头，6K 字符预算），system 指引模型用 read/grep 读全文 txt 或 `literature_read` 工具；Reading note 改为指示模型读全文 txt 后写笔记。浏览器端到端测试待补（同下）。
- **L2 SystemContext 源**：`packages/core/src/researchos-context.ts` 注册两个 Location 作用域 Source（模式照 `instruction-context.ts`，节点挂入 `location-services.ts`）。`researchos/library`：load 只读查询 `.researchos/literature/literature.db`（bun:sqlite 动态导入、readonly、无 `@researchos/*` 依赖），baseline 渲染库轮廓（论文数、collection 分布、最近 5 篇），update 渲染数量差 + 新增篇目；库文件缺失时注册 empty（触发 removed 文案），查询失败走 unavailable 保留旧快照。`researchos/selection`：读 `.researchos/selection.json`，baseline/update/removed 分别渲染"正在查看/焦点切换/不再聚焦"。配套轻量端点 `literature.select`（POST `/api/literature/selection`，`paperId` 缺省即清除）+ 文献页选中态变化时前端 fire-and-forget 上报；V2 会话每轮 reconcile 自动产出 diff system 消息，无需重开对话。浏览器端到端验证待补（同下）。
- **L1 一键启用**：资产页 MCP 面板顶部 "Enable research tools in chat" 卡片——调 `presetInstall({ pack: "researchos-mcp", target: "project" })`，保存成功与连接状态两步展示，"Connect all" 逐个连接并刷新状态；已启用时显示各 server 状态徽章。已知限制：该端点只写 `mcp` 配置块，预设中的 8 个 agent 不落盘（需后端扩展）。

浏览器端到端测试尚未补：需要运行中的后端与 Playwright 环境，后续按验收矩阵补录。

每个切片完成 = 页面已合入 + 后端真实可用 + 至少一条浏览器端到端测试通过 + 缺依赖/失败恢复有界面 + 本文档对应项打勾。
