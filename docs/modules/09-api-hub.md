# 模块九：外部 API 统一管理中心（API Hub）

> 对应总体方案模块九。目标：把 ResearchOS 各模块散落的外部 API 调用收敛到一个统一注册中心——**薄 fetch 封装 + zod 校验、不引入任何厂商 SDK**，统一处理认证、限流、缓存、状态监控与配置 UI。

---

## 一、模块概述与目标

文献、图谱、复现等模块各自直接 `fetch` 外部服务，会带来四个问题：限流逻辑各写一遍、API key 散落环境变量、schema 漂移无感知、出问题时没有统一状态视图。API Hub 提供一个**注册表（registry）+ 适配器（adapter）**层：所有外部 HTTP 调用必须经 Hub 注册，获得统一的限流、重试、缓存、key 注入与可观测性；UI 上在「资产管理中心」新增 API 面板做统一配置与状态监控。

## 二、功能清单与范围边界

**做：**

- 外部 API 统一注册表（声明式 adapter：base URL、认证方式、限流参数、zod schema）。
- 统一横切能力：速率限制（每 provider 令牌桶 + 串行队列 + 指数退避）、响应缓存（SQLite，TTL 可配）、API key 管理、健康探测、调用统计。
- 「资产管理中心」新增 **API 面板**：列表、状态点、key 配置、限额展示、手动测试、调用量统计。
- 配置持久化到 `opencode.json` 的 `researchos.api.*` 键（走 `asset.config_patch` 通道）。

**不做：**

- 不引入任何 API 厂商 SDK（arXiv/S2/Crossref 等全部手写薄 fetch + zod，代码量小且条款友好）。
- 不接管 LLM provider（Anthropic/OpenAI 等）——那是 opencode 原生 provider 体系的领地，Hub 只读展示其状态。
- 不做付费 API 聚合网关、不做代理转发服务。

## 三、API 盘点（全项目扫描结果）

| API | 用途（消费模块） | 认证 | 免费额度/限流 | 条款要点 |
| --- | --- | --- | --- | --- |
| **arXiv API** | 文献搜索（模块一） | 无 | 免费；建议 ≥3s 间隔、单次大批量 | 免费，要求合理频率 |
| **Semantic Scholar Graph API** | 搜索/引用关系/相似推荐（模块一、二） | 可选 API key | 无 key 约 100 req/5min；有 key 更高 | 免费学术使用，需注明来源 |
| **Crossref REST** | DOI 元数据补全、CSL/BibTeX（模块一、五） | 无（mailto 进 polite pool） | 免费；polite pool 更稳 | 免费，建议带 mailto 标识 |
| **NCBI E-utilities** | PubMed 搜索（模块一） | 可选 API key | 无 key 3 req/s；有 key 10 req/s | 免费，需遵守 usage guidelines |
| **GROBID**（自部署） | PDF 参考文献深度解析（模块一，可选） | 无（自托管） | 取决于自有 Docker 部署 | Apache-2.0，自托管无外部条款 |
| **GitHub REST API** | 复现 repo 元数据/release/语言统计（模块六；clone 本身走 git 不经 Hub） | token（复用 opencode credential） | 无 token 60 req/h；有 token 5000 req/h | GitHub API Terms |
| **HuggingFace Hub** | transformers.js 本地嵌入模型下载（模块二） | 可选 token | 免费，公开模型直接拉取 | 模型各自 license |
| **Tectonic bundle CDN** | LaTeX 宏包按需下载（模块三） | 无 | 免费 CDN | 包内宏包各自 license |
| **LibreTranslate**（自托管） | 全文翻译初译（模块十） | 无（自托管） | 自有部署无额度限制 | AGPL-3.0，自托管使用 |
| **DeepL API Free** | 全文翻译初译备选（模块十） | API key | 免费 50 万字符/月 | DeepL API Free 条款 |
| **LLM 润色** | 翻译第二级学术润色（模块十） | 原生 credential | 走 opencode 已配置 provider | **opencode 原生管理，不重复计费** |
| **models.dev catalog** | 模型目录（原生） | — | — | **opencode 原生管理，Hub 只读展示** |
| **LLM Providers**（Anthropic/OpenAI/Google/Ollama） | Agent 推理 | 原生 credential | — | **opencode 原生管理，不在 Hub 重复** |
| 预留：**OpenAlex / Unpaywall** | OA PDF 查找、元数据增强（后续迭代） | 无 / mailto | 免费 | 免费学术使用 |

分类原则：**科研领域 API 全部进 Hub 管理；平台级 API（LLM provider、models.dev）由 opencode 原生管理，Hub 仅聚合展示状态**，避免两套配置体系打架。

## 四、技术选型与落地形态

| 用途 | 选型 | 理由 |
| --- | --- | --- |
| Hub 内核 | 新包 `@researchos/api-hub`（`packages/researchos-api-hub`） | 被 literature/graph/reproduce 等包依赖，处于下游 |
| HTTP | 原生 `fetch` + 自写 retry/timeout 包装 | 零依赖，条款友好 |
| 校验 | zod（每 adapter 声明 response schema） | schema 漂移立即报错而非静默错数据 |
| 限流 | 内存令牌桶 + 串行队列 + 指数退避（自实现，约 100 行） | 不引依赖 |
| 缓存 | `bun:sqlite`，`.researchos/api-cache.db`（key = hash(url+params)，TTL 每 adapter 可配） | 学术元数据天然可缓存，显著降低限流压力 |
| key 存储 | GitHub token 复用 opencode credential；S2/NCBI key 存 `opencode.json` 的 `researchos.api.<name>.key` 或 `{env:VAR}` 引用（与原生 env 插值一致） | 沿用既有约定，不明文入库 |
| 配置写入 | `asset.config_patch`（jsonc 局部改写，见模块八） | 复用既有通道 |
| UI | 资产管理中心第 8 个面板 | 资产配置天然一处 |

落地形态决策：**Hub 是纯 TS 库包，不做 MCP server**——它服务对象是其他 `@researchos/*` 包的内部调用，不是直接暴露给 LLM 的工具面；Agent 可见的仍是 `literature_search` 等业务工具，Hub 在工具实现内部被调用。

## 五、核心接口实现

```ts
// packages/researchos-api-hub/src/registry.ts
export interface ApiAdapter<TReq, TRes> {
  name: string                    // "semantic_scholar"
  baseUrl: string
  auth: "none" | "api_key" | "bearer" | "mailto"
  rateLimit: { rps: number; burst?: number }
  cacheTtlS?: number
  request: (req: TReq) => { path: string; params?: Record<string, string> }
  schema: ZodType<TRes>           // 响应 zod 校验
}

export interface ApiHub {
  call<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes>
  status(name: string): ApiStatus   // { healthy, last_error?, rpm_used, cache_hit_rate }
  list(): ApiDescriptor[]           // 供 UI 面板
  test(name: string): Promise<{ ok: boolean; latency_ms: number; error?: string }>
}
```

`call` 内部固定管线：`缓存查找 → 令牌桶等待 → fetch(timeout 15s) → HTTP 错误/429 → 指数退避重试(≤3) → zod parse → 写缓存 → 统计计数`。任一环节失败抛出带 adapter 名的结构化错误，业务包决定降级（如 S2 挂了降级只用 Crossref 补全）。

各 adapter 实现要点（以 `semantic_scholar` 为例）：只声明所需字段的**窄 schema**（title/authors/year/externalIds/abstract/citationCount），忽略其余字段，把 schema 漂移面降到最小；arxiv 的 Atom XML 用轻量 XML 解析转 JSON 后同样过 zod。

## 六、配置与 UI

```jsonc
// opencode.json（由 API 面板写入）
{
  "researchos": {
    "api": {
      "semantic_scholar": { "key": "{env:S2_API_KEY}", "enabled": true },
      "ncbi":             { "key": "{env:NCBI_API_KEY}" },
      "crossref":         { "mailto": "you@example.com" },
      "grobid":           { "url": "http://localhost:8070", "enabled": false },
      "github":           { "enabled": true }   // token 走 opencode credential
    }
  }
}
```

**API 面板**（资产管理中心左侧导航第 8 项）：

- 列表行：名称、用途说明、状态点（绿=最近调用成功 / 黄=限流中 / 红=最近失败 / 灰=未启用）、速率限制标签（如 `3 req/s`）、本月调用量、缓存命中率。
- 行展开：key/mailto/url 配置表单（密文显示）、`测试连接` 按钮（调 `hub.test` 显示延迟与错误）、该 API 的条款摘要链接。
- 分区：「科研 API」（Hub 管理）与「平台 API」（LLM provider / models.dev，只读展示，点击跳原生 provider 设置）。

## 七、前端落地

- 面板组件：`packages/app/src/pages/assets/api-panel.tsx`（资产中心内，非独立路由）。
- 数据源：新增 `researchos-assets` group 的 `api.list / api.test / api.stats` 三个只读 endpoint（server handler 内 import `@researchos/api-hub`）；配置写走模块八的 `asset.config_patch`。
- 无新增侵入点（面板挂在资产中心既有页面内）。

## 八、开发步骤与里程碑

- W1：`@researchos/api-hub` 骨架——registry、令牌桶、缓存、统计；`crossref` + `arxiv` 两个 adapter 打样。
- W2：`semantic_scholar` + `ncbi` adapter；改造模块一的直连调用全部走 Hub；`api.list/stats/test` endpoint + client regenerate。
- W3：API 面板 UI（列表/配置/测试）；`github` adapter（复用 credential）；`grobid` adapter（可选开关）。
- W4：条款摘要与配额展示完善；OpenAlex/Unpaywall 预留 adapter 接口评审；集成冒烟测试。

## 九、测试方案

- 包内 `bun test`：令牌桶节奏、退避策略、缓存 TTL、zod 窄 schema 对多字段响应的容忍。
- adapter 集成测试用**录制 fixture**（真实响应 JSON 入库），不打真 API；另设手动触发的冒烟脚本打真端点验证 schema 漂移（CI  nightly 可选）。
- 遵守规则：测试在 `packages/researchos-api-hub` 目录内运行。

## 十、风险与开放问题

1. **schema 漂移**：窄 schema + 冒烟测试兜底；漂移时 Hub 报结构化错误并标记该 API 红色，业务降级。
2. **限流是进程内的**：CLI 与 desktop 同时运行时限流互不可见——可接受（学术 API 限额宽松），多进程协调列为后续问题。
3. **key 明文风险**：config 里坚持 `{env:VAR}` 引用，面板默认写 env 引用而非明文；文档明确告诫。
4. **GROBID 自部署**：无 Docker 环境的用户保持 disabled，文献模块规则解析兜底（见模块一风险节）。
5. **缓存一致性**：文献元数据可能被撤稿/更正——提供面板"清空该 API 缓存"操作与默认 7 天 TTL。
