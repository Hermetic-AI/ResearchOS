# ResearchOS 开发工作记录（2026-07-27）

## 目的与依据

本记录覆盖本轮对 ResearchOS 已有实现的审计、替换与验证。目标不是把“能编译”的占位代码包装为完成，而是按既定设计把 P0 底座和 P1 文献模块的第一条可用主链落到真实数据、真实文件和真实数据库上。

实施依据：

- `docs/ResearchOS最终方案.md`
- `docs/modules/01-literature.md`
- `docs/modules/09-api-hub.md`
- `docs/ai-coding-dev-plan.md`
- `docs/代码结构与上游同步.md`
- 仓库 `AGENTS.md` 的依赖方向、代码生成和包级验证规则

## 审计结论

审计开始时，部分 ResearchOS 包虽然存在目录、接口和测试，但实际功能大量为固定返回值或内存 stub，不能满足模块设计的“本地优先、真实数据、经 Server/Client 通道访问”的要求。

已确认并处理的典型问题：

- 文献 Server Handler 返回固定 `stub-001`；文献页面硬编码 Attention、BERT、GPT-3 三篇论文。
- Literature MCP 的搜索、PDF 导入和导出工具返回拼接的 stub 内容。
- API Hub 声称有 SQLite 缓存，实际为内存 `Map`；arXiv Atom XML 被错误地按 JSON 读取；Semantic Scholar 将 `{env:S2_API_KEY}` 占位符原样放进请求头。
- 资产中心中部分状态属于假数据或“未接通”占位。
- preset 中存在调用尚未实现的 `literature_import_pdf` 的命令，以及过宽的 Literature Agent 权限。

这些问题意味着旧实现只能算界面和包结构草稿，不能算模块交付。

## 本轮完成内容

### P0.1：资产管理中心

实现了 `server.researchos-assets` 协议组和真实 handler：

- 读取项目/全局 `AGENTS.md`，返回实际加载链。
- 写入 Skill、SubAgent、Command、Rules 四类文件。
- 对资产名称进行校验，阻断空名、路径穿越、斜杠、反斜杠、隐藏名和非约定大小写。
- 采用临时文件加 rename 的原子写入。
- 安装 ResearchOS Skills、Agents、Commands 预设；MCP 预设通过 `jsonc-parser` 局部合并配置，保留 JSONC 注释。
- 新增 API Hub 的 list/stats/test HTTP 端点，并重新生成 Client。

对应实现：

- `packages/protocol/src/groups/researchos-assets.ts`
- `packages/server/src/handlers/researchos-assets.ts`
- `packages/server/src/handlers/researchos-assets-path.ts`
- `packages/app/src/pages/assets/`

### P0.2：API Hub

将 API Hub 从演示性实现替换为实际的共享外部调用层：

- `bun:sqlite` 响应缓存，默认项目路径为 `.researchos/api-cache.db`。
- 启用 WAL、busy timeout、TTL 过期和 SQLite upsert。
- 缓存 key 使用 SHA-256，输入为适配器名和完整请求 URL。
- 每个 provider 使用带队列的令牌桶限流；仅对 429 与 5xx 等瞬态错误做指数退避重试。
- `{env:VARIABLE}` 在发送请求前解析；未解析时不会把占位文本发送到供应商。
- 实现并注册 arXiv、Crossref、Semantic Scholar、PubMed 四个适配器。
- arXiv 响应先以轻量 Atom XML 解析为对象，再过窄 Zod schema；不再错误调用 `response.json()`。
- PubMed 使用 esearch 后接 esummary，返回实际元数据记录。
- API 面板展示真实适配器、速率、缓存 TTL、调用数、缓存命中率、状态和手动连接测试；未提供虚构健康数据。

对应实现：

- `packages/researchos-api-hub/src/hub.ts`
- `packages/researchos-api-hub/src/cache.ts`
- `packages/researchos-api-hub/src/academic.ts`
- `packages/researchos-api-hub/src/adapters/`
- `packages/app/src/pages/assets/api-panel.tsx`

### P1 W1：文献检索、入库、查询和导出

已建立“检索 → 规范化 → 去重 → SQLite 入库 → 查询/导出”的可用纵向链路：

1. arXiv、Semantic Scholar、Crossref、PubMed 并行检索，单源异常降级为空结果，不阻断其他来源。
2. 统一为 `SearchResult`，以 DOI（规范化）→ arXiv ID（去版本）→ 规范化标题三级去重。
3. 重复条目合并非空元数据，引用数取最大值。
4. 使用 SHA-1 前 8 位生成稳定 paper ID。
5. 结果惰性写入 `.researchos/literature/literature.db`，论文作者及其顺序一并持久化。
6. 文献服务提供本地列表、单篇元数据读取，以及 BibTeX、RIS、EndNote、JSON、Markdown 导出。
7. Server、Protocol、生成 Client、三栏前端页面全部接入真实文献服务。

对应实现：

- `packages/researchos-literature/src/search.ts`
- `packages/researchos-literature/src/db.ts`
- `packages/researchos-literature/src/service.ts`
- `packages/researchos-literature/src/cli.ts`
- `packages/server/src/handlers/researchos-literature.ts`
- `packages/protocol/src/groups/researchos-literature.ts`
- `packages/app/src/pages/literature/literature.tsx`

### Literature MCP 与 preset

保留 Python FastMCP 外壳，但不再复制网络或 SQLite 业务逻辑：

- Python MCP 通过 Bun CLI 调用 `@researchos/literature` 的同一套 TypeScript 内核。
- 目前仅公开已真实实现的 `literature_search`、`literature_get_metadata`、`literature_export`。
- 删除误导性的 `literature_import_pdf` stub 和对应 preset command。
- 更新 Literature Agent：权限最小化，并明确 PDF 导入、引用关系、相似推荐尚未交付，禁止编造结果。

对应实现：

- `packages/researchos-mcp/literature/src/server.py`
- `packages/researchos-mcp/literature/test/test_server.py`
- `packages/researchos-preset/agent/literature.md`
- `packages/researchos-preset/opencode.researchos.json`

### P1 W2（本轮续作）：PDF 导入、元数据补全、引用关系解析与全链集成

按 §6.3 import_pdf 流程落地文献模块 W2 内核，并接通协议、前端、MCP 与 preset：

1. PDF 文本提取基于 `pdfjs-dist`（fake worker），按文本项坐标聚合成行；前 3 页提取 DOI/arXiv/年份，首页提取标题候选；DOI 命中走 Crossref 精确补全、标题走 Semantic Scholar 兜底，补全失败降级为 PDF 提取元数据，不阻断导入。
2. 导入路径白名单：本地路径解析后必须仍在项目工作区内，URL 仅允许 http/https；PDF 归档至 `.researchos/literature/pdfs/<year>/<paper_id>.pdf`。
3. 参考文献段规则解析（References/Bibliography 定位，`[n]`/`n.`/空行三种切条），可选 GROBID（`RESEARCHOS_GROBID_URL`）增强，失败降级回规则解析；引用目标落 `external_paper` + `citation_edge`。
4. Protocol 追加 `literature.import` / `literature.citations` 端点，Server handler 薄转发，Client 经 `bun run generate` 重新生成。
5. Python MCP 新增 `literature_import_pdf` / `literature_get_citations` 两个工具，经既有 Bun CLI 桥接；Literature Agent preset 放开对应权限并更新行为准则。
6. 文献前端中栏新增"导入 PDF"表单（路径/URL 二选一，真实错误与进行态），详情面板新增 References / Cited by 区块（`inLibrary` 条目可点击跳转）。

对应实现：

- `packages/researchos-literature/src/pdf/`（extract/metadata/references/grobid）
- `packages/researchos-literature/src/import.ts`、`db.ts`、`service.ts`、`cli.ts`
- `packages/researchos-literature/test/`（fixtures 与 pdf/import 测试）
- `packages/protocol/src/groups/researchos-literature.ts`
- `packages/server/src/handlers/researchos-literature.ts`
- `packages/researchos-mcp/literature/src/server.py` 与测试
- `packages/researchos-preset/agent/literature.md`
- `packages/app/src/pages/literature/literature.tsx`

### P1 W3（本轮续作）：CSL 引用渲染与 Zotero 一次性导入

按 §6.3 export/cite 与 §5 Zotero 导入映射落地 W3：

1. 集成 citation-js（core/plugin-csl/plugin-bibtex/plugin-ris 0.8.2）：ieee/acm/apa/nature/springer 五个官方 CSL 文件打包进包内 `csl/` 目录，运行时不联网；`PaperMeta` → CSL JSON（venue 启发推断 paper-conference/article-journal，单字符串作者名末词作 family）；BibTeX/RIS 解析用于往返互转。无类型声明问题集中在一个 `@ts-expect-error` 边界封装文件处理。
2. `export` 增加可选 `style` 参数：markdown + style 输出 CSL 渲染的编号引用列表，其余格式忽略 style；手写序列化器保留。
3. Zotero 一次性导入：只读复制 `zotero.sqlite` 到临时文件后打开（避免锁冲突）；防御式读取（缺表/缺字段跳过并记 warnings，不崩）；映射 items/fields/creators/tags/collections/PDF 附件（storage 与 linked_file 两种 linkMode），DOI 规范化去重、走既有 upsert 合并；PDF 复制进统一归档目录。
4. Protocol `literature.export` 加 `style` query、`literature.import` 加 `zoteroPath` payload 与 `zotero` report 出参；Zotero 路径允许在项目工作区外（只读复制，handler 有注释说明）；Client 重新生成。
5. MCP `literature_export` 透传 `style`；按六工具契约不加 Zotero 工具，Zotero 导入只走 HTTP 端点；前端导入区加 Zotero 库路径入口（成功显示 imported/skipped/pdfsCopied/warnings 摘要），导出区加格式五选 + CSL 样式可选。

对应实现：

- `packages/researchos-literature/src/cite.ts`、`citation-js.ts`、`zotero.ts`、`export.ts`、`db.ts`、`service.ts`、`cli.ts`
- `packages/researchos-literature/csl/`（五个官方 CSL 文件）
- `packages/researchos-literature/test/cite.test.ts`、`test/zotero.test.ts`
- `packages/protocol/src/groups/researchos-literature.ts`
- `packages/server/src/handlers/researchos-literature.ts`
- `packages/researchos-mcp/literature/src/server.py` 与测试
- `packages/app/src/pages/literature/literature.tsx`

### P1 W4（本轮续作）：向量嵌入、相似推荐与 cited_by 在线补全

按 §6.3 recommend_similar 流程与 §2 cited_by 约定落地 W4，P1 内核四周至此全部完成：

1. sqlite-vec 经 npm 包 `sqlite-vec`（win32-x64 预编译）在 Windows + `bun:sqlite` 实测加载成功；db init 探测加载并建 vec0 表，失败置 `vecAvailable=false` 整体降级。vec0 不支持 UPSERT，嵌入覆盖用 DELETE+INSERT 事务。
2. 嵌入管线用 `@huggingface/transformers`（`@xenova/transformers` 同项目新名）+ `bge-small-en-v1.5`，懒加载、缓存到项目 models/；Embedder 全部依赖注入，测试零真实模型。
3. `recommend_similar`：目标无嵌入现场计算并落库 → vec0 KNN（k=limit*3，L2 距离 1/(1+d) 归一）+ 共引加分（共享 references × 0.15）→ 排除自身排序返回；vec/模型不可用降级为标题+摘要关键词重叠，结果带 `degraded: true`。
4. `get_citations` 的 cited_by 方向新增 S2 在线补全：api-hub 追加 `semanticScholarCitationsAdapter`（`/graph/v1/paper/{id}/citations`），拉取结果落 external_paper + citation_edge（source: semantic_scholar）后走本地查询；网络失败静默降级为纯本地结果。
5. importPdf 落库后异步写嵌入（失败不阻断导入）；Protocol 追加 `literature.similar` 端点（SimilarPaper = Paper + score，结果带 degraded）；MCP 补第六个工具 `literature_recommend_similar`，六工具契约齐；前端详情面板加相似文献区块（score 展示、degraded 提示、可点击跳转）；preset agent 放开 recommend 权限并写明降级说明义务。

对应实现：

- `packages/researchos-literature/src/embed.ts`、`recommend.ts`、`db.ts`、`service.ts`、`cli.ts`
- `packages/researchos-literature/test/recommend.test.ts`、`test/cited-by.test.ts`
- `packages/researchos-api-hub/src/adapters/semantic-scholar.ts`（citations 适配器）与测试
- `packages/protocol/src/groups/researchos-literature.ts`
- `packages/server/src/handlers/researchos-literature.ts`
- `packages/researchos-mcp/literature/src/server.py` 与测试
- `packages/researchos-preset/agent/literature.md`
- `packages/app/src/pages/literature/literature.tsx`

### P2 图谱后端（本轮续作）：知识图谱内核、MCP 与 HTTP 接口真实化

按原始 SQLite 设计（`.sisyphus/tmp-02-graph-original.md`）实施；`docs/modules/02-knowledge-graph.md` 的 Neo4j 重写版未采纳、未改动（冲突待裁决）。本轮只做后端，前端画布（仍为 mock 数据）不动。

1. 内核包 `packages/researchos-graph` 重写：`Store` 接口 + `SqliteStore`（nodes/edges/node_fts/vec0 四表，WAL + busy_timeout，upsert 幂等、replaceBySource 先删后插回收、FTS 同步维护、sqlite-vec 失败降级 `vecAvailable=false`）；wikilink 解析用 `mdast-util-from-markdown` AST（remark-parse 的底层解析器，单依赖）；Graph RAG 召回（vec KNN topK=8 / FTS 降级）→ k-hop BFS（默认 1 最大 2）→ contextPack（4k 字符预算），只返回子图与上下文，不生成 answer。
2. bibkey → 文献库的近似解析：DOI 规范化 > arXiv ID > bibtex key 惯例（作者姓+年份+标题首词），查不到降级 `undefined`。
3. MCP stdio server（`src/mcp.ts`）四工具 `parse_wikilinks`/`upsert`/`query`/`layout`，preset `opencode.researchos.json` 已声明 `researchos-graph`（bun 直跑 TS）；InMemoryTransport roundtrip 测试覆盖四工具与路径越界拒绝。
4. Protocol/handler 真实化：`graph.get`（type 过滤含坐标）、`graph.node`（详情+一度邻居+文献元数据）、`graph.ask`（返回 subgraph/contextPack/seeds/sources，answer 字段按设计留空由调用方生成）、`graph.save_layout`（坐标持久化）；store 句柄按 project 缓存；Client 重新生成。
5. Preset：`agent/graph.md` 权限收敛到四个 graph 工具 + 按设计 §7.1 的行为准则；`skill/graph-rag/SKILL.md` 按 §7.2 重写。`.opencode/plugin/graph-autolink.ts`（文件变更自动重解析）：preset 无 plugin 事件钩子先例，留待后续。

对应实现：

- `packages/researchos-graph/src/`（types/store/wikilink/embed/rag/layout/mcp/paths/index）与 `test/`（wikilink/store/rag/mcp）
- `packages/protocol/src/groups/researchos-graph.ts`
- `packages/server/src/handlers/researchos-graph.ts`
- `packages/researchos-preset/opencode.researchos.json`、`agent/graph.md`、`skill/graph-rag/SKILL.md`
- `packages/researchos-graph/README.md`

### P3.1（本轮续作）：LaTeX 后端内核、MCP 与 HTTP 接口真实化

按 `docs/modules/03-latex-editor.md` 落地 LaTeX 模块后端（前端 Monaco/PDF 预览页本轮不做）：

1. 审计结论：旧 `compile.ts` 真实 spawn 但无二进制定位/超时/outdir/severity，日志解析简陋且有 stub（`mainFileFromLog` 返回 null）；旧 `formatCheck` 是 toy 规则；`parseBibtex`/`extractCiteKeys` 真实但脆弱。全部重写或硬化。
2. 编译管线：二进制定位 env→项目 bin→PATH，缺失返回 `{available:false, installHint}` 绝不假装成功；`--keep-logs --synctex --outdir` + 120s 超时；stderr 与 `.log` 双源诊断（`file:line:`/`error:`/`warning:`、`!`+`l.<n>` 行对、bad box）去重。
3. SyncTeX 自研解析（`.synctex.gz` gunzip → Input/记录索引），正反向最近邻；BibTeX 花括号配对扫描 parser + 章节大纲；format_check 通用六规则 + ieee/acm 模板规则，`\input`/`.bib` 自动收集、全程项目根白名单。
4. MCP stdio server 三工具（compile/synctex/format_check），preset 声明 `researchos-latex`；HTTP 三端点（compile POST / synctex GET / format_check POST）真实 handler；`latex-troubleshoot` Skill 落仓。

对应实现：

- `packages/researchos-latex/src/`（compile/synctex/bibtex/outline/format/query/mcp/paths/types/index）与 `test/`（parse/synctex/compile/format/mcp）
- `packages/protocol/src/groups/researchos-latex.ts`
- `packages/server/src/handlers/researchos-latex.ts`
- `packages/researchos-preset/opencode.researchos.json`、`skill/latex-troubleshoot/SKILL.md`
- `packages/researchos-latex/README.md`

### P3.2（本轮续作）：论文写作助手后端与智能体资产真实化

按 `docs/modules/05-paper-writing.md` 落地模块五后端（前端写作侧栏本轮不做）：

1. 审计结论：旧 `csvToLatex` 无引号处理且无数值对齐；旧 `mdToLatex` 是脆弱正则（每个列表项各包一层 itemize）；`codeToAlgorithm` 与 `rewrite` 按设计本应走 Skill（LLM）而非确定性工具，正则"伪改写"全部删除；旧包名为 plugin 但并未实现 Plugin 接口。
2. plugin 真实化：默认导出 `PluginModule`（`{id, server}`），五工具——`table_to_latex`（papaparse）、`md_to_latex`（markdown-it token 流 + TODO 降级）、`bibtex_upsert`（key 查重追加）、`bibtex_from_library`（只读 P1 文献库 + 复用 literature 的 toBibtex）、`suggest_record`（写作三张表，落 `.researchos/writing/writing.db`——设计原定的 P1 researchos.db 不存在，README 注明偏离）。rewrite.ts 替换为 jsdiff 词级 diff + 句级 hunk 纯函数（供前端 review）。
3. preset：`skill/algo2e/` 新建（代码→Algorithm2e 方法论）；`agent/paper-writer.md` 权限从 `all` 收敛到实际工具键、正文按设计 §7.1 硬规则重写；`skill/academic-polish/` 补 protected spans 与输出契约。
4. 无 HTTP 通道：写作工具全部走 plugin tool + SubAgent，协议未动（设计 §4 形态决策）。

对应实现：

- `packages/researchos-writing/src/`（convert/diff/bibtex/store/library/types/index）与 `test/`（convert/bibtex-diff/store-library/plugin）
- `packages/researchos-preset/skill/algo2e/SKILL.md`、`agent/paper-writer.md`、`skill/academic-polish/SKILL.md`
- `packages/researchos-writing/README.md`

### P4.1（本轮续作）：数据分析中心后端真实化

按 `docs/modules/04-data-analysis.md` 落地模块四后端（Notebook 前端本轮不做）：

1. 审计结论：TS `runStatTest`/`linkArtifact` 是纯 stub（固定返回值）、`profileFromCsv` 真实但粗糙；Python `server.py` 四个工具全是 stub 且缺 link_experiment；protocol/handler 也是 stub；preset agent 权限 `all` 且工具名写错。全部重写。
2. Python FastMCP（`packages/researchos-mcp/data`，hatchling src 布局）：五工具真实实现——`run_python`（worker 子进程 stdio JSON-RPC、共享命名空间、超时杀 worker 重启并明示、stdout/stderr 64KB 截断、产物 mtime 扫描登记）、`profile`（pandas 画像 + 数据集登记缓存）、`stat_test`（scipy 八检验 + 效应量 + 中文结论模板 + stat_tests 落库）、`chart`（nature/ieee 主题、主格式 + svg 预览 + LaTeX 片段 + spec_json 可重放）、`link_experiment`（git HEAD 缺省、tex 章节扫描 warning、upsert）。沙盒：路径白名单 resolve 前缀校验；网络出站本期全禁（worker 内 patch socket.create_connection）。mcp pin `<2`（2.0 移动了 FastMCP 导入路径，与 literature 一致 1.28.x）。
3. TS 产物库（`packages/researchos-data`，bun:sqlite 而非文档写的 better-sqlite3——与 literature/graph 统一，inventory 已注）：contract.ts 五契约 zod schema、DataStore 全套读写与产物字节白名单读取；HTTP 六端点（datasets/artifacts/artifact/artifactFile/stat-tests/link）真实 handler，client 重新生成。
4. preset：`agent/data-analyst.md` 权限收敛到 `researchos-data_*` 五工具真实名 + 设计 §7.1 工作流与统计纪律。

对应实现：

- `packages/researchos-mcp/data/`（pyproject + src/researchos_data_mcp/{server,kernel,kernel_worker,db,sandbox,frames,profiling,stats,charts}.py + tests/）
- `packages/researchos-data/src/`（contract/db/paths/index）与 `test/`、`README.md`
- `packages/protocol/src/groups/researchos-data.ts`
- `packages/server/src/handlers/researchos-data.ts`
- `packages/researchos-preset/agent/data-analyst.md`

### P4.2（本轮续作）：科研绘图后端与数据通道真实化

按 `docs/modules/07-plot.md` 落地图表 spec、统计图执行面、代码图 plugin 和公开 HTTP 数据通道（四模式前端本轮不做）：

1. `@researchos/plot-core`：ChartSpec/深合并、四期刊主题、严格 p→stars、LaTeX/TikZ 桥接；OpenCode plugin 四工具真实实现 Mermaid 官方 parser、Graphviz WASM、draw.io 文件与插入论文。
2. Python FastMCP：精确暴露 `plot_chart_create` / `plot_chart_tune` / `plot_annotate_significance`，六模板生成自包含 chart.py、SVG/PDF；SciPy 真实检验，mtime 代码优先模式。
3. TS/Python 共享 `.researchos/plots.db`；图表、代码图及论文引用状态统一登记，所有路径限制在项目根内。
4. HTTP 九端点覆盖 chart create/tune/significance、Mermaid/Graphviz/draw.io、insert-to-paper、artifact list/file；Server 用 one-shot JSON bridge 调 Python 执行面，Client 已重新生成。
5. 新增 plot SubAgent 与 scientific-plot Skill；依赖锁定 `mermaid`、`@hpcc-js/wasm` 与 Python PyData 栈。

## 前端设计原则

资产中心与文献页面按项目既有主题 token 构建，避免新增硬编码品牌色或模板化假仪表盘。关键约束：

- 计数、状态、文献列表和导出内容均来自接口或本地数据库。
- 连接失败、数据库为空、能力尚未接通时显示明确空状态或错误，而非伪造成功。
- API 面板将请求来源和限流/缓存信息作为可见的“数据血缘”信息。
- 页面保留键盘焦点样式和窄窗口布局，不直接访问 SQLite。

## 验证记录

以下验证均在对应 package 目录执行，未从仓库根目录运行测试：

| 验证 | 结果 |
| --- | --- |
| 13 个相关包的 `tsgo --noEmit` | 全部通过 |
| `@researchos/api-hub` 测试 | 10 通过 |
| `@researchos/literature` 测试 | 11 通过 |
| Client 测试 | 16 通过 |
| Protocol 测试 | 2 通过 |
| Server 资产路径测试 | 7 通过 |
| Literature MCP Python→Bun→SQLite 桥接测试 | 1 通过 |
| 其他现有 ResearchOS 包测试 | 37 通过 |
| 合计 | 84 通过，0 失败 |
| App 生产构建（跳过 public 复制） | 成功，转换 2454 个模块 |
| `git diff --check`（本轮文本改动范围） | 无空白错误 |

Client 在协议变更后均通过 `packages/client && bun run generate` 重新生成；未手改 generated 文件。

## 当前边界：已完成与未完成

### 已完成

- P0.1 资产管理基础能力。
- P0.2 API Hub 基础设施与资产中心 API 面板。
- P1 W1 文献四源检索、去重、SQLite 入库、真实列表/详情/基础导出、真实 MCP 桥接。
- P1 W2 PDF 文本提取、受限路径/URL 导入、PDF 归档、DOI 在线补全、参考文献规则解析（含可选 GROBID 客户端）、引用关系入库与双向查询，及 Protocol/Server/Client/MCP/前端集成。
- P1 W3 BibTeX/RIS 往返解析、五种 CSL 样式引用渲染（样式文件包内打包）、Zotero 本地库一次性导入（含标签/集合/PDF 附件映射），及 Protocol/Server/Client/MCP/前端集成。
- P1 W4 sqlite-vec 向量检索、本地嵌入管线、`recommend_similar`（含关键词降级路径）、S2 cited_by 在线补全，及 Protocol/Server/Client/MCP/前端集成；MCP 六工具契约全部交付。
- P2 图谱后端：wikilink/\cite 解析、SQLite 图谱存储（含 FTS/vec 降级）、Graph RAG 内核、MCP 四工具、HTTP 四端点真实化（按原 SQLite 设计，02 文档 Neo4j 重写版未采纳）。
- P2 图谱前端：mock 页替换为真实 HTTP 数据的全屏画布（d3-force/d3-zoom，类型着色、关系线型、拖拽持久化坐标、邻居高亮、类型筛选/力导环形切换/搜索定位、节点详情抽屉含文献元数据、RAG 提问条展示 sources+contextPack；answer 按设计由会话生成，UI 不伪造）。
- P3.1 LaTeX 后端：Tectonic 定位（env→项目 bin→PATH）与缺失诚实降级、双源结构化诊断、SyncTeX 正反向解析、BibTeX/大纲解析、format_check 规则集（通用六条 + ieee/acm 模板规则）、MCP 三工具、HTTP 三端点真实化；前端编辑器页未做。
- P3.2 写作助手后端：`@researchos/writing` 改为真实 OpenCode plugin 包（五个确定性工具：CSV/MD→LaTeX、BibTeX 查重追加、文献库只读取 BibTeX、建议落库），写作三张表落 `.researchos/writing/writing.db`；algo2e Skill 新建，paper-writer 权限收敛、academic-polish 补 protected spans 与输出契约；前端写作侧栏未做。
- P4.1 数据分析后端：Python FastMCP 五工具真实化（沙盒 worker 子进程 + 超时重启 + 输出截断 + 网络全禁；pandas 画像、scipy 检验含效应量中文结论、matplotlib/seaborn 双主题出图、产物↔commit↔tex 三元关联）、TS 产物库（bun:sqlite 与 Python 共享同一 data-analysis.db）、HTTP 六端点真实 handler；Notebook 前端未做。
- P4.2 科研绘图后端：plot-core plugin、Python FastMCP 三工具、六模板/四主题、真实显著性检验、共享产物库与 HTTP 九端点全部真实化；四模式绘图前端未做。
- P6.3 侧栏 icon rail：初始提交已包含 `packages/app/src/pages/layout/sidebar-shell.tsx`（researchos 标记块）+ `packages/app/src/components/researchos-rail.tsx`，9 个模块入口（overview/literature/graph/latex/data/plot/reproduce/translate/assets）已可点击导航，无需重复开发。新布局（newLayoutDesigns）会话页无左侧 rail，已在 V2 顶栏 home 按钮旁补 `ResearchosModulesMenu` 下拉入口（`packages/app/src/components/researchos-modules-menu.tsx`，titlebar.tsx researchos 标记块挂载），两套布局均可点到全部模块页。

### 未完成，不能对外宣称已交付

- 文献前端：导入与引用关系基础版已接通；导入任务进度、相似条增强、分类树增强和虚拟滚动未做。
- 图谱：graph-autolink 文件变更自动重解析（无 plugin 先例）未做；RAG answer 生成（设计由会话/Agent 基于 contextPack 生成）未接会话链路。
- LaTeX：前端 Monaco/PDF 预览页、latex_build/latex_format_issue 持久化表、latex-editor SubAgent 未做。
- 写作：LaTeX 页内嵌写作侧栏（依赖 P3 编辑器页）、paper-titles/paper-structure/cite-assist 三个 Skill 未做。
- 数据：Notebook 前端、KernelClient 双客户端共连 worker 与 cells/run 端点、课题级 venv 自举、jupyter_client/Optuna 扩展未做。
- 绘图：四模式绘图工坊、draw.io iframe、调参/代码双向状态与产物画廊前端未做。
- 其他模块（Reproduce、Translate）的完整模块验收。

特别说明：部分其他包现有测试名称仍直接包含 `stub`（例如 Plot、Translate）。这些包虽然通过了当前测试和类型检查，但不应被视为符合完整模块设计。

## 环境与工作区风险

Windows 工作区存在原有 Git symlink/reparse point 静态资源无法被 Vite `stat` 的问题，例如 `packages/app/public/apple-touch-icon-v3.png`。这会使普通 `bun run build` 在复制 public 资源阶段失败；关闭 public 复制后的应用代码生产构建已成功。

该问题不属于本轮业务代码，但在 Windows CI 或本地正式构建前应单独处理 symlink checkout/资源实体化策略。

## 后续工作顺序

建议严格按既定方案继续：

1. P1 前端打磨（W6 范围）：文献页导入任务进度、虚拟滚动、分类树增强；MCP 六工具已齐，无新增内核依赖。
2. 随后进入 P2：图谱、LaTeX、数据、绘图、复现、翻译等模块的真实主链替换。

每一阶段都应继续遵守：先定义 Protocol/Server 契约，运行 Client 生成，再接前端；测试只能验证真实实现，不能以固定 stub 返回值充当验收。
