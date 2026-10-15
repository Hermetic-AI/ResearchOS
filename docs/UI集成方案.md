# ResearchOS UI 集成方案 —— 与 OpenCode Web / Desktop 的结合与适配

> 对应设计稿：《ResearchOS-UI设计.md》；交互原型：`artifacts/researchos-ui/index.html`。
> 本文说明新 UI 如何落到 OpenCode 真实代码里，以及在 Desktop / Web 两端的适配策略。

---

## 一、先厘清 OpenCode 的"Web"与"Desktop"

| 包 | 角色 | ResearchOS 要不要动 |
| --- | --- | --- |
| `packages/app` | **真正的产品 UI**：SolidJS SPA（Vite），Desktop 的渲染层直接复用它 | **主战场**：新页面都加在这里 |
| `packages/desktop` | Electron 壳：renderer `import { AppInterface } from "@opencode-ai/app"`，只加原生标题栏/菜单/更新器 | 几乎不动，只处理二进制分发（Tectonic） |
| `packages/web` | Astro + Starlight 的**营销/文档站**（opencode.ai），不是应用 | 不动 |
| `packages/ui` | 共享设计系统：组件、主题令牌、字体、图标 | 只消费，不修改 |
| `packages/session-ui` | 会话/聊天渲染组件（markdown、diff、prompt input） | 复用 |

**结论**：OpenCode 是"一套 SPA，两端承载"——Desktop = Electron 包着 `packages/app`；Web 端应用 = 同一个 SPA 由 server 托管或静态部署后连接远端 server。因此 ResearchOS 的 UI 只需**在 `packages/app` 做一遍**，两端自动获得；真正需要适配的是两端能力差异（见 §五）。

---

## 二、设计一致性：只用令牌，不写死颜色

原型（`artifacts/researchos-ui/index.html`）里的色值是设计令牌的具体化，落地时**禁止照抄十六进制**，必须映射到 `@opencode-ai/ui` 的令牌：

| 原型色值 | 落地方式 |
| --- | --- |
| `#0a0a0a` / `#111114` 背景 | `bg-background-base` / `bg-surface-raised-base` 等 Tailwind 类 |
| `#eeeeee` / `#8a8a8a` 文字 | `text-text-strong` / `text-text-weak` |
| `#fab283` 橙主色 | 主题 `primary` 令牌（37 套主题各自定义，自动跟随换肤） |
| 模块色（蓝/紫/青/绿/粉） | 映射到 `info/accent/success` 等语义令牌；图谱节点等必须固定色时，在主题 JSON 里按 schema 扩展键，而非组件内硬编码 |
| 13/14px、4px 间距、2–8px 圆角 | 主题已定义（`text-12-regular`、`--spacing`、`--radius-*`），直接用 |

字体（Inter / JetBrains Mono）已由 `packages/ui` 内置，无需引入。图标沿用 `packages/ui/src/components/icon.tsx` 的几何风格——ResearchOS 需要的新图标（文献、图谱、烧杯、绘图）按同一风格（方形线帽、16×16、含 `-active` 变体）补充，**补充方式**：在 `packages/app` 侧新增本地 icon 组件，不改 `packages/ui` 源文件（避免侵入）。

---

## 三、页面落地：原型视图 → packages/app 映射

| 原型视图 | app 路由（`app.tsx` 追加，`/:dir` DirectoryLayout 下） | 页面目录 |
| --- | --- | --- |
| ⌂ 总览 | `/:dir/overview` | `pages/overview/` |
| ◉ Agent 会话 | 复用 `/:dir/session/:id`（不改） | —（增强点：SubAgent 标签渲染，走 session-ui 的 message-part 扩展） |
| ▤ 文献管理 | `/:dir/literature` | `pages/literature/`（collection-tree / paper-list / paper-detail 三栏组件） |
| ◈ 知识图谱 | `/:dir/graph` | `pages/graph/`（canvas / topbar / node-drawer / rag-bar） |
| 𝌆 LaTeX 编辑器 | `/:dir/latex` | `pages/latex/`（editor / preview / outline / build-log + `writing/` 写作助手侧栏五标签页） |
| ∑ 数据分析 | `/:dir/data` | `pages/data/`（notebook-cell / output / data-panel） |
| ▦ 科研绘图 | `/:dir/plot` | `pages/plot/`（四模式：chart / canvas / diagram / mermaid） |
| ⌥ 代码复现 | `/:dir/reproduce` | `pages/reproduce/`（pipeline-stepper / compare-card / repo-panel） |

### 3.1 路由注册（受控侵入点 #4）

`packages/app/src/app.tsx` 的 `Routes()` 中，用标记注释包裹追加：

```tsx
{/* researchos:start */}
<Route path="/:dir/overview" component={OverviewPage} />
<Route path="/:dir/literature" component={LiteraturePage} />
<Route path="/:dir/graph" component={GraphPage} />
<Route path="/:dir/latex" component={LatexPage} />
<Route path="/:dir/data" component={DataPage} />
<Route path="/:dir/plot" component={PlotPage} />
<Route path="/:dir/reproduce" component={ReproducePage} />
{/* researchos:end */}
```

页面组件统一 `import` 自 `pages/researchos-*/`，页面内部的组件、store、样式全部放自己目录——对 app.tsx 而言每个模块就一行。

### 3.2 侧栏入口（受控侵入点 #5）

现状是 16 宽 icon rail（`pages/layout/sidebar-shell.tsx`）+ 可展开 panel。ResearchOS 模块在 rail 追加一组图标按钮（同样标记注释包裹），点击导航到对应路由。注意：

- 仓库正处在新旧布局并存期（`settings.general.newLayoutDesigns()` 切换 `layout.tsx` / `layout-new.tsx`）。**入口组件写成布局无关的 `ResearchosRail` 小组件**，在两个 shell 中各插入一行；上游 v2 布局定型后只需维护一处。（已落实：旧 shell 用 `ResearchosModuleRail`，新布局主页用 `ResearchosModuleRailV2`，标题栏 `ResearchosModulesMenu` 与会话/主页选中项目联动；目录解析统一走 `useResearchosDirectory`。）
- rail 图标顺序与原型侧栏一致：总览/文献/图谱/LaTeX/数据/绘图/复现。

### 3.3 复用既有组件清单

| 需求 | 复用 |
| --- | --- |
| 按钮/卡片/对话框/标签页/提示 | `@opencode-ai/ui` 的 button、card、dialog、tabs、tooltip、dropdown-menu、toast |
| 可拖拽分栏（LaTeX 编辑↔预览、文献三栏） | `@opencode-ai/ui` 的 resize-handle + scroll-view |
| 命令面板 ⌘K | 扩展 app 的 `dialog-command-palette-v2`，把文献/笔记/章节注册为新 provider |
| 写作润色 diff、复现代码改动 | `@opencode-ai/session-ui` 的 review/diff 组件（`@pierre/diffs`） |
| Agent 对话条（各模块内嵌） | session-ui 的 prompt-input；上下文芯片走既有 attachment 机制 |
| 代码/源码视图（Mermaid、生成的 matplotlib 代码） | session-ui 的 shiki markdown 代码块 |
| 文件树（LaTeX 工程、复现 repo） | app 的 file-tree-v2 |

原则：**能复用不新造**；必须新造的（力导图 canvas、图表 SVG 渲染器、PDF.js 预览）做成页面目录内的局部组件。

### 3.4 数据通道

页面不直连 SQLite/子进程，统一走生成的 client SDK：

```
页面 → @opencode-ai/client(生成) → protocol researchos-* groups → server handlers → @researchos/* 包 / Python MCP 侧
```

新增 endpoint 的流程固定为：protocol 加 group → server 加 handler → `cd packages/client && bun run generate`。实时性需求（编译日志流、复现流水线进度、沙盒执行输出）复用 OpenCode 已有的 event 推送机制（protocol 的 Event group），页面订阅事件流刷新，不另起 WebSocket。

---

## 四、Desktop 适配（`packages/desktop`）

- **零改动部分**：Electron renderer 复用 `@opencode-ai/app`，新页面自动可用；原生标题栏标签、菜单、更新器不受影响。
- **二进制分发**：Tectonic、（可选）Graphviz 等原生依赖随 desktop 打包——在 electron-builder 配置（desktop 包内）追加 `extraResources`，按 win/mac/linux 分发对应二进制；`@researchos/latex` 的 `ensureTectonic` 优先读打包路径，读不到再下载（SHA256 校验）。这是对 desktop 包唯一预期的修改，同样用标记注释。
- **Python 沙盒**：desktop 端要求本机有 uv/python（首次运行检测并引导安装），沙盒 venv 建在课题目录 `.researchos/venv`。
- **窗口/性能**：力导图与 PDF 预览是重渲染区，遵循 desktop 既有模式（worker + 离屏 canvas），图谱物理模拟放 Web Worker。

## 五、Web 适配（同一 SPA 的浏览器形态）

`packages/app` 是纯 SPA，连远端 opencode server 即可在浏览器工作（OpenCode 自身就支持 server 模式）。但 ResearchOS 部分能力依赖本机资源，需要明确分级：

| 能力 | Desktop / CLI 本地 | Web（连自托管 server） | 纯浏览器（无本地 server） |
| --- | --- | --- | --- |
| 文献搜索/元数据/推荐 | ✅ | ✅（server 侧执行） | ⚠️ 仅 API 检索可用，本地库不可用 |
| PDF 解析入库 | ✅ | ✅（上传到 server 工作区） | ❌ |
| 知识图谱（存储/可视化） | ✅ | ✅ | ⚠️ 只读演示 |
| LaTeX 编译 | ✅（本地 Tectonic） | ✅（server 上 Tectonic） | ❌（预览只读） |
| Python 沙盒数据分析 | ✅ | ✅（沙盒在 server 主机，需容器隔离加固） | ❌ |
| 科研绘图（Mermaid/模板图） | ✅ | ✅ | ✅ 前端渲染部分可用 |
| 代码复现流水线 | ✅ | ✅（server 上跑，建议容器） | ❌ |

适配策略：

1. **能力探测**：页面挂载时经 client 查询 server 端能力位（health/group 里加 `capabilities` 字段），不可用的功能置灰并提示原因，而不是报错。
2. **执行位置无关**：所有重活（编译、Python、解析）本来就封装在 server handler / MCP server 里，SPA 天然不感知执行位置——这是坚持"页面不直连本机资源"的回报。
3. **Web 安全加固**：自托管 server 上跑 Python 沙盒时，把 venv 子进程升级为容器/更强隔离（模块文档 04 已列为风险项）；多用户场景不属于首版范围。
4. **布局响应式**：OpenCode app 本身是桌面优先的密集布局，Web 端沿用同一布局，不为移动端做适配（科研工作站的合理取舍）；仅保证 1280px 以上不挤压——原型已按 1440px 验证。

---

## 六、交互与动效落地映射

原型中的亮点交互 → 既有机制：

- **SubAgent 身份标签与交接**：会话消息中按 agent 名渲染彩色 chip（橙调度/蓝文献/紫图谱/青数据/绿写作/粉绘图），复用 session-ui message-part 的 tool 块渲染，颜色走语义令牌。
- **AI 流式 shimmer/typewriter**：session-ui 已有 text-shimmer，直接用。
- **写作助手"接受/拒绝"hunk**：复用 session review 的交互与状态管理，绝不自己实现一套 diff 审批。
- **⌘K 跨模块搜索**：command palette v2 增加 provider（文献按标题、笔记按 `[[wikilink]]`、章节按 outline），选中后导航到对应路由并带 query 参数定位。
- **Toast / 进度**：`@opencode-ai/ui` toast；长任务（编译、复现）用状态栏 + 事件流驱动。

---

## 七、实施顺序建议

1. 先打通"一个页面 + 一个 protocol group + 一个 handler + client regenerate"全链路（建议用文献库列表页，数据流最简单）。
2. 沉淀页面骨架模式（路由懒加载、能力探测、事件订阅、错误态）为 `pages/researchos-*/` 的公共约定，后续 5 个页面照抄。
3. LaTeX 编辑器与绘图工坊最复杂（Monaco/PDF.js/canvas），排在数据通道稳定之后。
4. 每个页面落地时对照原型逐项核对交互（原型即验收标准），视觉验收用 storybook（`packages/storybook`）补 story。
