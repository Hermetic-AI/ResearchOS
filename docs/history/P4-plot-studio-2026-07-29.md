# P4.2 科研绘图工坊开发纪要（2026-07-29）

## 交付

- App 用四个真实工作区替换 Plot 占位页：六模板统计图、1/2/4 panel 数据画布、draw.io 示意图、Mermaid/Graphviz 代码图。
- 统计图工作区调用 Python bridge 生成 SVG/PDF，支持四期刊主题、spec patch、生成代码查看和真实 Welch t-test 星标。
- Mermaid 在浏览器以 strict security 模式预览并持久化 `.mmd`；Graphviz 由 WASM 后端渲染并持久化 SVG/DOT。SVG 一律通过 image data URL 展示，不注入 DOM。
- draw.io iframe 仅接受 `https://embed.diagrams.net` 且来自当前 frame 的消息；新增 `plot.diagramSave`，校验项目内 `.drawio` 与 mxfile XML 后原子替换。
- 产物图库展示版本与论文引用状态，可调用 `insertToPaper` 写入真实 LaTeX figure block。

## 验证

- `@researchos/plot-core`: 8 tests passed，含 Mermaid、Graphviz、论文插入及 draw.io 原子保存/越界拒绝。
- App draw.io 协议解析：1 test passed；Plot Core、Protocol、Server、Client、App 类型检查通过。
- Client 已在新增公开 HTTP 端点后重新生成；App 生产构建通过。

## 边界

- draw.io v1 使用官方在线嵌入站；无网络时仍可保留项目 `.drawio` 文件，但编辑器不可用。自托管静态包属于后续离线增强。
- 数据画布 v1 是非破坏性的对比/排版工作区，不合并源图，也不替代后端出版导出。
- PlantUML 与自然语言 AI bar 仍由 Plot Agent 的工具编排承担，不在首版浏览器直接调用模型。
