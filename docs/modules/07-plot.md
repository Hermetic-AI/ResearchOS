# 模块七：科研绘图中心（Plot）技术落地文档

> 对标 Prism / Origin / Visio。上游依据：`docs/ResearchOS最终方案.md` 模块七、技术选型表、接口定义 5.6 节；UI 依据：`docs/ResearchOS-UI设计.md` 3.9 节（科研绘图工坊）。
> 落地形态遵守"低侵入原则"：全部能力以 MCP server / plugin tool / SubAgent / Skill / `@researchos/*` 新包 / app 前端路由页面的形式外挂，不改 OpenCode 核心。

> 实现状态（2026-07-29）：P4b.1–P4b.6 已完成。除 plot-core、Python FastMCP、共享产物库、HTTP/Client 与 Plot Agent/Skill 外，App 已交付统计图三栏工作区、1/2/4 子图画布、draw.io 嵌入保存、Mermaid/Graphviz 代码图和可插入论文的产物图库。draw.io 新增 XML 原子保存端点，完整 HTTP 契约为十端点。

## 1. 模块概述与目标

科研绘图中心为 ResearchOS 提供"面向出版"的绘图闭环：Prism 风格统计图表模板库（分组柱状误差棒、散点回归、箱线/小提琴、生存曲线、热图，含显著性星标与 Nature/Science/IEEE 期刊主题）、Origin 风格多子图画布与可视化调参（面板与代码双向同步）、draw.io 嵌入做 Visio 类示意图、Mermaid/Graphviz/PlantUML 代码即图、TikZ/PGFPlots 导出，以及 AI 自然语言生成图和一键"插入论文"（自动生成 `\includegraphics` + caption + label）。目标：用户从 CSV 到期刊级 Figure、从一句话到架构示意图，全程不出 ResearchOS，产物进 Git、可复现、与论文 LaTeX 源码联动。

## 2. 功能清单与范围边界

**做什么（对应 5.6 节九个接口）：**

| 功能 | 接口 | 说明 |
| --- | --- | --- |
| 统计图表创建 | `plot.chart_create` | 模板 + 数据（文件或 inline）+ 期刊主题 → SVG/PDF 产物 + chart_id |
| 可视化调参 | `plot.chart_tune` | 对 chart_id 下发增量 patch（坐标轴/刻度/图例/配色），双向同步底层 Python 代码 |
| 显著性标注 | `plot.annotate_significance` | t-test / ANOVA / Mann-Whitney → p 值 → `*/**/***` 星标叠加 |
| 示意图编辑 | `plot.diagram_edit` | 创建/打开 `.drawio` 文件，前端嵌入 draw.io 编辑器，配科研 stencil 包 |
| Mermaid 渲染 | `plot.mermaid_render` | flowchart/sequence/gantt/class/er 源码 → SVG |
| Graphviz 渲染 | `plot.graphviz_render` | DOT 源码 → SVG（dot/neato/fdp 引擎） |
| AI 生成图 | `plot.generate_diagram` | 自然语言 → mermaid/drawio/graphviz 源码 + 预览 |
| 导出 | `plot.export` | pdf / svg / png(300DPI) / tikz |
| 插入论文 | `plot.insert_to_paper` | 生成 `\includegraphics` + caption + label 片段并写入 tex 文件 |
| 产物画廊 | （前端） | 课题内全部图表缩略图时间线，标注被论文引用状态 |

**不做什么：**

- 不做探索性数据分析与"算"的部分（数据清洗、统计建模属模块四数据分析中心，本模块只消费其输出数据，共享同一 Python 沙盒与产物库）。
- 不做在线协作绘图（draw.io 的协同编辑、评论），仅单人本地编辑。
- 不自研图表渲染引擎：统计图走 Matplotlib/Seaborn，示意图走 draw.io，代码图走 Mermaid/Graphviz 官方实现。
- PlantUML 列为可选扩展（依赖 Java/服务器），首版只保证 Mermaid + Graphviz。
- 不做 WYSIWYG 的统计图画布拖拽编辑（那是 Origin 全量功能），首版"双向同步"限定为：调参面板 ↔ spec JSON ↔ 生成代码三者同步。

## 3. 技术选型与开源依赖

| 用途 | 选型 | 理由 | License |
| --- | --- | --- | --- |
| 统计图渲染 | Matplotlib + Seaborn（Python 沙盒内） | 科研标准生态，出版级矢量输出（PDF/SVG） | PSF / BSD-3 |
| 显著性检验 | SciPy.stats（`ttest_ind` / `f_oneway` / `mannwhitneyu`） | 与沙盒已有依赖重合，无新增 | BSD-3 |
| 图表 spec 与主题 | 自研 JSON spec（`@researchos/plot-core`）+ Matplotlib rcParams 主题表 | spec 是"面板 ↔ 代码双向同步"的中间表示，必须自有 | — |
| Mermaid 渲染 | `mermaid`（npm，前端渲染）+ 服务端 `mermaid.parse` 校验 | 官方实现；SVG 生成放前端避免 Node 端无头 DOM 复杂度 | MIT |
| Graphviz 渲染 | `@hpcc-js/wasm`（Graphviz 的 WASM 移植） | 免安装本地 graphviz binary，TS 侧直接 `dot → svg`，跨平台 | Apache-2.0 |
| PlantUML（可选扩展） | 本地 `plantuml.jar` / 远程 server | 生态标准；首版不做，预留接口 | GPL-3.0（仅生成物可自由使用） |
| 示意图编辑 | draw.io（diagrams.net）web 嵌入（iframe + postMessage 协议） | 最成熟开源 Visio 替代，文件格式开放可进 Git | Apache-2.0 |
| TikZ/PGFPlots 导出 | Matplotlib 后端 `matplotlib.backends.backend_pgf` + 自研 PGFPlots 模板（tikzplotlib 已停维，不采用） | pgf 后端官方内置，输出可直接 `\input` | PSF |
| PDF/PNG 导出 | Matplotlib `savefig`（pdf/png）；SVG→PDF 备用 `cairosvg` | 沙盒内一站式 | PSF / LGPL-3.0 |
| MCP 封装（Python 侧） | FastMCP（`mcp` Python SDK，stdio） | 与模块四沙盒同栈，opencode.json `mcp` 键声明 local command 即可挂载 | MIT |
| TS 侧工具封装 | OpenCode `packages/plugin` 的 `tool({description, args: zod, execute})` | 原生集成点，Mermaid/Graphviz/spec 操作均为纯 TS 无状态逻辑 | — |
| 数据存储 | SQLite（科研知识底座同库）+ 文件目录产物库 | 本地优先，与总方案一致 | — |

## 4. 落地形态决策

| 能力 | 形态 | 理由 |
| --- | --- | --- |
| 图表 spec 定义、期刊主题表、产物库 DAO、`insert_to_paper` 的 LaTeX 片段生成、TikZ 模板 | 新 package `@researchos/plot-core`（TS，`packages/researchos-plot-core`） | 纯逻辑、被 plugin tool 与 app 前端共同消费；放共享包避免重复实现 |
| `plot.chart_create` / `chart_tune` / `annotate_significance` / `export`（python 执行面） | Python MCP server：`packages/researchos-plot-mcp`（FastMCP，stdio），`opencode.json` 的 `mcp` 键声明 `{type:"local", command:["uv","run","..."]}`，工具以 `plot_*` 暴露给模型 | 统计渲染必须跑在含 PyData 栈的 Python 沙盒；MCP 是总方案规定的统一协议 |
| `plot.mermaid_render`（校验+存盘）、`plot.graphviz_render`、`plot.diagram_edit`（文件创建）、`plot.insert_to_paper` | plugin tool：`packages/researchos-plot-plugin`（TS，`.opencode/plugin/` 自动发现），内部 import `@researchos/plot-core` | 纯 TS 无状态（`@hpcc-js/wasm` 进程内跑），走 plugin 比再起一个 MCP 进程简单；`tool()` + zod 即可定义 |
| `plot.generate_diagram` | 不单独实现工具：由 Plot SubAgent 的 prompt 编排完成——LLM 生成源码 → 调 `mermaid_render`/`graphviz_render`/`diagram_edit` 落盘 | "自然语言 → 图源码"本质是模型生成能力，工具层只提供渲染与落盘 |
| 绘图专家身份与路由 | SubAgent：`.opencode/agent/plot.md`（`mode:"subagent"`，粉色标签） | 总方案"5 大专业 SubAgent"架构要求；经内置 TaskTool 被调度 |
| 绘图领域知识（模板选择、星标规范、期刊主题规范、导出 checklist） | Skill：`.opencode/skill/scientific-plot/SKILL.md` | 让任意 Agent（含写作 SubAgent）复用绘图规范，经内置 SkillTool 调用 |
| 绘图工坊四模式页面 | app 前端路由 `/plot`：`packages/app/src/pages/plot/`，侧栏 icon rail 加入口 | UI 设计 3.9 节要求；前端消费 plugin 暴露的服务端事件与文件产物 |
| 前端渲染 Mermaid 预览 | `mermaid` npm 包直接在 SolidJS 组件内 render-to-SVG | 官方推荐用法，实时预览无需回环服务端 |

依赖方向合规性：`@researchos/plot-core` 不依赖 Core/Server；plugin 与 MCP server 位于 OpenCode 运行时下游；app 前端只通过 Client 协议与文件产物交互，不引入 Core/Server 依赖。

## 5. 数据模型与本地存储设计

### 5.1 文件目录约定（工作区内，全部进 Git）

```
<workspace>/researchos/plots/
├── charts/                  # 统计图
│   └── <chart_id>/
│       ├── spec.json        # 图表 spec（面板 ↔ 代码同步的单一事实源）
│       ├── chart.py         # 由 spec 生成的 Matplotlib 代码（可复现）
│       ├── data.csv         # inline 数据落盘副本（file 数据源只存引用路径）
│       └── out/
│           ├── figure.svg
│           ├── figure.pdf
│           ├── figure.png   # 300 DPI
│           └── figure.pgf   # TikZ/PGFPlots
├── diagrams/
│   ├── <name>.drawio        # draw.io 示意图
│   ├── <name>.mmd           # Mermaid 源码
│   └── <name>.dot           # Graphviz 源码
└── exports/                 # export 接口的临时导出物（长期产物仍在各目录 out/）
```

### 5.2 SQLite 表（科研知识底座同库，迁移随底座初始化执行）

```sql
-- 统计图表登记
CREATE TABLE IF NOT EXISTS plot_chart (
  id            TEXT PRIMARY KEY,            -- chart_id，nanoid
  workspace_id  TEXT NOT NULL,
  template      TEXT NOT NULL,               -- grouped_bar|scatter_regression|boxplot|violin|survival|heatmap|...
  theme         TEXT NOT NULL DEFAULT 'nature',
  spec_path     TEXT NOT NULL,               -- researchos/plots/charts/<id>/spec.json
  code_path     TEXT NOT NULL,               -- chart.py
  data_ref      TEXT NOT NULL,               -- 数据源路径或 'inline'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 统一产物登记（图、示意图、代码图共用；画廊与论文引用状态的数据源）
CREATE TABLE IF NOT EXISTS plot_artifact (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  kind          TEXT NOT NULL,               -- chart|drawio|mermaid|graphviz
  chart_id      TEXT,                        -- kind=chart 时关联 plot_chart.id
  path          TEXT NOT NULL,               -- 主产物路径（svg/pdf/drawio/mmd/dot）
  preview_svg   TEXT,                        -- 画廊缩略用 SVG 文本（小图）
  tex_file      TEXT,                        -- 已被插入的论文 tex 路径（NULL = 未引用）
  tex_label     TEXT,
  commit        TEXT,                        -- 生成时的 git commit（可复现追溯）
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plot_artifact_ws ON plot_artifact(workspace_id, kind);
```

## 6. 核心接口实现

### 6.1 spec 与双向同步（`@researchos/plot-core`）

spec 是调参面板、生成代码、渲染结果三者同步的单一事实源。`chart_tune` 的 patch 只改 spec.json，随后重新生成 chart.py 并重跑渲染。

```ts
// packages/researchos-plot-core/src/spec.ts
import { z } from "zod"

export const ChartSpec = z.object({
  template: z.enum(["grouped_bar", "scatter_regression", "boxplot", "violin", "survival", "heatmap"]),
  theme: z.enum(["nature", "science", "ieee", "prism"]).default("nature"),
  data: z.union([z.object({ file: z.string() }), z.object({ inline: z.array(z.record(z.unknown())) })]),
  encoding: z.object({
    x: z.string(),
    y: z.string(),
    group: z.string().optional(),
    error: z.enum(["sd", "sem", "ci95"]).optional(),
  }),
  axes: z.object({
    x_label: z.string().optional(),
    y_label: z.string().optional(),
    y_lim: z.tuple([z.number(), z.number()]).optional(),
    tick_font_size: z.number().default(7),      // Nature 规范默认 7pt
  }).default({}),
  legend: z.object({ show: z.boolean().default(true), position: z.string().default("best") }).default({}),
  annotations: z.array(z.object({
    groups: z.tuple([z.string(), z.string()]),
    p_value: z.number(),
    stars: z.enum(["*", "**", "***", "ns"]),
  })).default([]),
})
export type ChartSpec = z.infer<typeof ChartSpec>
```

```ts
// packages/researchos-plot-core/src/latex.ts
export function includeGraphicsSnippet(input: {
  path: string; caption: string; label?: string; width?: string
}) {
  const label = input.label ?? `fig:${slug(input.path)}`
  return [
    `\\begin{figure}[htbp]`,
    `  \\centering`,
    `  \\includegraphics[width=${input.width ?? "0.8\\linewidth"}]{${input.path}}`,
    `  \\caption{${input.caption}}`,
    `  \\label{${label}}`,
    `\\end{figure}`,
  ].join("\n")
}
```

期刊主题实现为 Matplotlib rcParams 字典表（`packages/researchos-plot-mcp/researchos_plot/themes.py`）：字号、线宽、色板（Nature 分类色 / Science / IEEE 黑白灰 / Prism 默认色）、 spine 取舍、刻度方向，按 `spec.theme` 查表注入。

### 6.2 Python MCP server（`packages/researchos-plot-mcp`）

`opencode.json` 挂载方式：

```json
{
  "mcp": {
    "plot": { "type": "local", "command": ["uv", "run", "--directory", "packages/researchos-plot-mcp", "python", "-m", "researchos_plot.server"] }
  }
}
```

工具签名（FastMCP，stdio；模型侧名为 `plot_chart_create` 等）：

```python
@mcp.tool()
def chart_create(template: str, data: dict, theme: str = "nature", spec: dict | None = None) -> dict:
    """出参: {chart_id, artifact_path, preview_svg}"""
    # 1. 合并 default_spec(template) + spec → ChartSpec 校验
    # 2. 落盘 researchos/plots/charts/<chart_id>/{spec.json, data.csv?}
    # 3. render_chart_py(spec) 生成 chart.py 写入同目录
    # 4. 沙盒子进程执行 chart.py → out/figure.svg|pdf
    # 5. INSERT plot_chart / plot_artifact，返回结果

@mcp.tool()
def chart_tune(chart_id: str, patch: dict) -> dict:
    """出参: {artifact_path, code}"""
    # spec.json 深合并 patch → 重新生成 chart.py → 重跑 → 返回最新代码文本

@mcp.tool()
def annotate_significance(chart_id: str, test: str, groups: list[list[str]]) -> dict:
    """出参: {artifact_path, p_values}"""
    # 1. 读数据源，对每组配对跑 scipy 检验得 p
    # 2. p → stars: p<0.001 '***'; p<0.01 '**'; p<0.05 '*'; else 'ns'
    # 3. annotations 追加进 spec.json → 重新生成代码（星标横线按组 x 坐标 + y_max*1.05 起逐级抬升）→ 重跑

@mcp.tool()
def export(artifact_path: str, format: str, dpi: int = 300) -> dict:
    """format=pdf/svg/png 直接 savefig/复制；format=tikz 用 backend_pgf 重渲染出 figure.pgf"""
```

chart.py 生成要点：模板函数 `render_<template>(df, spec, theme_rcparams)` 一一对应六种模板；生成代码必须是**自包含可独立运行**的脚本（读 data.csv、import matplotlib），保证可复现与"改代码即更新图"——用户在面板下展开代码手动编辑后，`chart_tune` 检测 chart.py mtime 新于 spec.json 时改为直接执行现有脚本而不再覆盖生成。

### 6.3 plugin tool（`packages/researchos-plot-plugin`）

```ts
// packages/researchos-plot-plugin/src/index.ts
import { tool, type Plugin } from "@opencode-ai/plugin"
import { z } from "zod"

export const PlotPlugin: Plugin = async () => ({
  tool: {
    mermaid_render: tool({
      description: "Render Mermaid source to an artifact: validate syntax, persist .mmd, return SVG or errors",
      args: {
        code: z.string(),
        theme: z.string().optional(),
        name: z.string().optional(),
      },
      async execute(args) {
        // 1. mermaid.parse(args.code) 校验；失败返回 { errors }
        // 2. 写 researchos/plots/diagrams/<name>.mmd
        // 3. 前端预览由页面内 mermaid.render() 完成；服务端返回 { artifact_path, code }
        //    （需要服务端 SVG 的导出路径走 plot.export 调前端已渲染 SVG 或 mermaid-cli）
        return JSON.stringify({ artifact_path, code: args.code })
      },
    }),

    graphviz_render: tool({
      description: "Render Graphviz DOT source to SVG via @hpcc-js/wasm",
      args: { dot: z.string(), engine: z.enum(["dot", "neato", "fdp"]).default("dot"), name: z.string().optional() },
      async execute(args) {
        const { graphviz } = await import("@hpcc-js/wasm-graphviz")
        const svg = await graphviz.layout(args.dot, "svg", args.engine)
        // 写 .dot 与 .svg，INSERT plot_artifact(kind='graphviz')
        return JSON.stringify({ svg, artifact_path })
      },
    }),

    diagram_edit: tool({
      description: "Create or open a .drawio diagram file for the embedded draw.io editor",
      args: {
        action: z.enum(["create", "open"]),
        file: z.string().optional(),
        stencil_pack: z.enum(["nn_layers", "agent", "flow"]).optional(),
      },
      async execute(args) {
        // create: 写空 mxfile XML 骨架到 researchos/plots/diagrams/<n>.drawio + 登记 artifact
        // open: 校验文件存在
        // 前端读取 artifact 事件后在 iframe 中加载 draw.io 并 postMessage load 该文件
        return JSON.stringify({ file })
      },
    }),

    insert_to_paper: tool({
      description: "Insert an \\includegraphics figure block with caption/label into a tex file",
      args: {
        artifact_path: z.string(),
        tex_file: z.string(),
        section: z.string().optional(),
        caption: z.string(),
        label: z.string().optional(),
      },
      async execute(args) {
        // 1. 相对 tex_file 计算图片相对路径；pdf 优先于 svg（LaTeX 兼容性）
        // 2. includeGraphicsSnippet() 生成片段
        // 3. 定位插入点：section 指定时插到 \section{...} 块末尾，否则追加文件尾
        // 4. UPDATE plot_artifact SET tex_file, tex_label
        return JSON.stringify({ ok: true, latex_snippet })
      },
    }),
  },
})
```

### 6.4 `plot.generate_diagram` 编排伪代码（Plot SubAgent 内部流程）

```
input: { description, kind }
1. LLM 按 kind 生成源码（mermaid / dot / drawio XML），prompt 中由 scientific-plot Skill 注入对应语法约束
2. 校验渲染:
   - mermaid  → 调 plot_mermaid_render，若返回 errors，把错误回喂 LLM 重试（最多 2 轮）
   - graphviz → 调 plot_graphviz_render（layout 抛错同样回喂）
   - drawio   → 调 plot_diagram_edit(action=create) 后写入 XML
3. 返回 { file, preview_svg }
```

## 7. SubAgent 与 Skill 定义

### 7.1 `.opencode/agent/plot.md`

```markdown
---
description: 科研绘图专家——统计图表、示意图、代码图的生成与出版级精修
mode: subagent
color: "#EC4899"
permission:
  edit: allow
  bash: ask
---

你是 ResearchOS 的科研绘图专家（Plot SubAgent），对标 Prism/Origin/Visio 的工作流。

## 职责
- 用 plot_chart_create 创建统计图表：按数据形态选模板——组间比较用 grouped_bar/boxplot/violin，相关关系用 scatter_regression，生存数据用 survival，矩阵用 heatmap。
- 组间比较默认跟进 plot_annotate_significance：两组用 ttest（不正态用 mannwhitneyu），多组用 anova + 事后两两比较；p 值一律转星标。
- 论文用途的图必须套用期刊主题（theme: nature/science/ieee），导出用 plot_export 出 pdf + tikz。
- 示意图与流程图优先 diagram-as-code（mermaid/graphviz，源码可 diff）；需要自由布局时用 plot_diagram_edit 创建 drawio 文件让用户在前端编辑。
- 自然语言画图请求：先生成源码、调渲染工具校验，渲染报错要读错误信息修正后重试，不要把坏图交付给用户。
- 完成图后主动询问是否 plot_insert_to_paper 插入论文。

## 约束
- 产物一律落在 researchos/plots/ 目录，不写到工作区外。
- 不自己写一次性绘图脚本绕过模板库；只有模板确实表达不了时，才生成自定义 chart.py 并说明原因。
- 显著性检验的 p 值必须来自真实计算，禁止编造。
```

### 7.2 `.opencode/skill/scientific-plot/SKILL.md`

```markdown
---
name: scientific-plot
description: 科研绘图规范——图表模板选择、显著性星标规则、期刊主题（Nature/Science/IEEE）参数、出版级导出 checklist。当用户要画统计图、示意图、流程图或导出论文插图时使用。
---

# 科研绘图规范

## 模板选择
| 数据形态 | 模板 |
| --- | --- |
| 分组均值比较（带误差棒） | grouped_bar（error: sem 默认） |
| 分布展示 | boxplot / violin（样本量 < 30 优先 violin 叠散点） |
| 两变量关系 | scatter_regression（默认 95% CI 回归带） |
| 生存/时间事件 | survival（Kaplan-Meier，附 risk table） |
| 矩阵/相关性 | heatmap（发散色板，中心 0） |

## 显著性星标
`*` p<0.05，`**` p<0.01，`***` p<0.001，`ns` 不显著。两组比较默认 ttest，多组先 ANOVA 再两两；标注线从柱顶误差棒上方 5% 量程起逐级抬升，禁止重叠。

## 期刊主题
- nature: 正文 7pt、标题 8pt、线宽 0.5–1pt、单栏 89mm / 双栏 183mm 宽。
- science: 字号 7–9pt、无网格线、刻度朝外。
- ieee: 黑白灰优先（打印友好）、线型区分系列、字号 8pt。
- prism: Prism 默认配色，供演示用途。

## 导出 checklist（论文用图）
1. 矢量优先：pdf 或 tikz；png 仅照片类位图且 ≥300 dpi。
2. 字体嵌入（pdf）/ 字体与正文一致（tikz/pgf）。
3. plot_insert_to_paper 生成 \includegraphics + caption + label，label 统一 fig: 前缀。
4. 确认 plot_artifact 已登记 tex_file（画廊"已引用"状态）。
```

## 8. 前端界面落地

路由：在 `packages/app/src/app.tsx` 的 `Routes()` 增加 `/plot`；侧栏 icon rail（`packages/app/src/pages/layout/sidebar-shell.tsx`）加 `▦ 科研绘图` 入口。页面代码全部放 `packages/app/src/pages/plot/`：

```
packages/app/src/pages/plot/
├── plot.tsx                 # 页面骨架：顶部模式切换条 + 导出条（全模式通用）
├── chart/
│   ├── chart-mode.tsx       # 统计图表模式：模板库 | 画布 | 调参面板 三栏
│   ├── template-gallery.tsx # 左侧模板缩略图栅格（六种模板静态 SVG 缩略图）
│   ├── chart-canvas.tsx     # 中间：preview SVG 渲染 + 主题切换 chip
│   └── tune-panel.tsx       # 右侧：axes/legend/配色表单 → 调 chart_tune；底部可展开 chart.py 代码（只读高亮 + 复制）
├── canvas/
│   └── canvas-mode.tsx      # 数据画布模式：子图网格布局器，每格绑定 chart_id（复用 chart-canvas 渲染）
├── diagram/
│   └── diagram-mode.tsx     # 示意图模式：iframe 嵌入 draw.io，postMessage(load/save) 桥接 .drawio 文件；左侧 stencil 包切换
├── code/
│   ├── code-mode.tsx        # 代码图模式：左编辑器（mono 高亮）右实时 SVG（mermaid.render / 后端 graphviz SVG）
│   └── ai-bar.tsx           # 底部 AI 输入条 → 触发 Agent（plot SubAgent）generate_diagram 流程
└── gallery.tsx              # 产物画廊：读 plot_artifact 渲染缩略图时间线，tex_file 非空标"已引用"
```

实现要点：

- **组件复用**：按钮/输入/标签页/Toast 用 `@opencode-ai/ui` 既有组件，配色一律消费主题令牌类（`bg-background-base`、`text-text-base` 等），不写死色值；代码展示复用 app 内已有的代码高亮组件。
- **与工具的衔接**：调参面板提交即调 `chart_tune`（经 server 转发到 MCP），返回的 `artifact_path` 带 mtime query 刷新 `<img>`/inline SVG；Mermaid 预览在前端用 `mermaid` 包本地 render，不往返服务端；Graphviz 预览调 `graphviz_render` 取 SVG。
- **draw.io 嵌入**：iframe 指向 `embed.diagrams.net`（离线构建可自托管静态包，见风险节），`postMessage` 协议 `{action:"load", xml}` / `{action:"save"}`；保存时把 XML 写回工作区 `.drawio` 文件并进 Git。
- **双向同步**：tune-panel 表单态 ↔ 返回的 spec 单向数据流；用户手改 chart.py 后页面提示"已进入代码优先模式"，面板置灰对应字段（对应 6.2 的 mtime 规则）。
- **SubAgent 标签**：AI 输入条触发的任务带粉色绘图标签（UI 设计第四节）。

## 9. 开发步骤与里程碑

按周拆分（在总方案 P4 阶段内，依赖 P0 底座与模块四沙盒）：

- **W1｜底座与 spec**（依赖：P0 SQLite 底座就绪）：建 `packages/researchos-plot-core`（spec zod 定义、主题 rcParams 表、latex.ts、产物库 DAO）；`plot_chart` / `plot_artifact` 表迁移；`packages/researchos-plot-mcp` 骨架跑通 stdio 握手并挂进 `opencode.json`。
- **W2｜统计图三接口**（依赖：模块四 Python 沙盒可执行脚本，若未就绪先用本地 venv 顶替）：`chart_create` / `chart_tune` / `annotate_significance` 六模板 + 四主题；chart.py 生成与重跑机制。
- **W3｜代码图与导出**：`@researchos/plot-plugin` 四个 tool（mermaid 校验、graphviz WASM 渲染、diagram_edit、insert_to_paper）；`export` 含 tikz/pgf 路径。
- **W4｜前端统计图表模式 + 代码图模式**：路由与侧栏入口；chart-mode 三栏 + 双向同步；code-mode 编辑器/预览/AI 条；接 `@opencode-ai/ui` 主题。
- **W5｜示意图模式 + 数据画布 + 画廊**：draw.io iframe 桥接与 stencil 包；多子图网格布局器；产物画廊与"已引用"状态。
- **W6｜SubAgent/Skill 联调与收尾**：`plot.md` SubAgent、`scientific-plot` Skill 打磨；`generate_diagram` 重试流程；端到端演示"CSV → 显著性星标图 → tikz 导出 → 插入论文"。

## 10. 测试方案

遵守仓库规则：**不在 repo 根目录跑测试**，各包目录内执行；`bun typecheck` 也从包目录跑。

- **`packages/researchos-plot-core`**（`bun test`）：spec zod 解析与深合并 patch 的单测；`includeGraphicsSnippet` 输出快照测试（caption/label/相对路径计算）；p→stars 映射边界（0.05/0.01/0.001 临界值）。
- **`packages/researchos-plot-mcp`**（pytest，包目录内）：六模板各一条 golden 测试——固定 CSV + 固定 spec，断言 chart.py 生成文本含关键调用、产物 SVG/PDF 文件存在且非空；`annotate_significance` 用构造数据断言 p 值与星标数（与 scipy 手算对拍，不 mock scipy）；`export(format=tikz)` 断言 `.pgf` 含 `\begin{pgfpicture}`。
- **`packages/researchos-plot-plugin`**（`bun test`）：`graphviz_render` 对固定 DOT 断言返回 SVG 以 `<svg` 开头且 engine 参数生效；`mermaid_render` 对非法源码返回 `errors`；`insert_to_paper` 用临时 tex 文件断言片段插入位置（section 定位）与 artifact 表 `tex_file` 更新。
- **集成测试**（`packages/researchos-plot-mcp/tests/integration`，标记为慢测）：起真实 stdio MCP server，按 5.6 节契约跑 `chart_create → chart_tune → annotate_significance → export → insert_to_paper` 全链路，断言每步出参字段与数据库登记一致。
- **前端**：app 包现有测试体系内加 tune-panel 表单→patch 序列化、gallery 按 `tex_file` 分组渲染的组件测试；draw.io postMessage 桥接以协议消息断言（不加载真实 iframe）。

## 11. 风险与开放问题

1. **draw.io 嵌入的离线可用性**：`embed.diagrams.net` 依赖外网。规避：自托管 drawio 静态构建（Apache-2.0 允许）随 app 分发；首版可先接在线版，离线打包列为 P4 收尾项。自托管包的版本升级策略待定。
2. **服务端 Mermaid SVG 生成**：`mermaid` 包需 DOM 环境。当前决策是"服务端只校验，SVG 由前端渲染"；但 `export` 在无前端场景（CLI）下需要 SVG。备选：引入 `mermaid-cli`（puppeteer，重）或 `jsdom` 兜底，待 CLI 场景需求明确后再定。
3. **双向同步的冲突模型**：用户手改 chart.py 与面板 patch 冲突时，首版用 mtime 单向切换（代码优先后面板置灰），不做三方合并。开放问题：是否需要"从代码反推 spec"（解析 AST）恢复面板可用，成本高，暂缓。
4. **TikZ 导出的字体一致性**：`backend_pgf` 依赖 LaTeX 引擎做最终排版，与 Tectonic（模块三）的宏包拉取需联调验证；pgf 与 PGFPlots 手工模板的取舍在 W3 实测后定。
5. **Python 沙盒边界**：`chart.py` 在沙盒执行，读数据限定工作区（复用模块四沙盒策略）；`annotate_significance` 读外部数据源文件时的路径白名单需与模块四对齐。
6. **统计检验正确性**：星标涉及出版结论，多重比较校正（Bonferroni/Holm）首版只做标注不做强制，开放问题：是否在 Skill 规范中默认开启 Holm 校正。
7. **PlantUML 的 GPL 与 Java 依赖**：保持可选扩展，不进首版依赖；若做，走远程 server 或用户自带 jar，不随包分发。
