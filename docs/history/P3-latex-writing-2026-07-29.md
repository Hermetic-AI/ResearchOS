# P3 LaTeX 编辑器与论文写作侧栏开发纪要（2026-07-29）

## 结论

P3 的浏览器主链已从演示 stub 替换为真实实现。页面现在消费类型化 HTTP 契约，所有文件读写限定在项目根目录的 `.tex/.bib`，PDF 只读取 `.researchos/latex/build`。模型能力与确定性转换分离：浏览器不伪造标题或润色结果，AI 请求交给 `paper-writer`；CSV、Markdown、diff、BibTeX 合并由可测试的 writing core 执行。

## 实现

- `@researchos/latex`：新增源码列表/读取/原子保存、构建 PDF 读取、`latex_build` 与 `latex_format_issue` SQLite 历史；扫描排除 `.git`、`.researchos`、`node_modules`。
- Protocol/Server/Client：LaTeX 扩展为文件、PDF、构建历史、compile、SyncTeX、format-check 九条数据路径；Writing 删除 rewrite/algo 回显 stub，新增 CSV/Markdown、diff/apply、BibTeX library/upsert、suggestion record/list 七条真实路径；执行 Client generate。
- App：`pages/latex/` 新增 Monaco Monarch、BibTeX cite key completion、真实保存/编译、PDF.js 翻页缩放、SyncTeX 双击反查与源码正向定位、可点击 diagnostics、实时 outline、最近成功构建恢复。
- 写作侧栏：标题/结构/润色/排版/引用五标签；润色按句 hunk 接受/拒绝后调用 core 重组；引用只接受 literature 返回的 paper ID，并先解析/合并 BibTeX 再插入 `\cite{key}`。
- Preset：新增 `latex-editor` SubAgent 与 `paper-titles`、`paper-structure`、`cite-assist` Skills；`paper-writer` 可用 Skill 清单同步。
- 构建：App 增加 `monaco-editor@0.52.2` 与 `pdfjs-dist@6.1.200`。Windows 云占位 public 资产会拒绝 `stat`，Vite 支持仅在 `RESEARCHOS_SKIP_PUBLIC=1` 时跳过 public 复制，用于代码构建验证；正常 CI/发行构建仍复制 public。

## 验证

均在对应 package 目录执行：

- `packages/researchos-latex`: 33 tests passed。
- `packages/researchos-writing`: 18 tests passed。
- `packages/protocol`: 2 tests passed。
- `packages/server`: 7 tests passed。
- `packages/client`: 16 tests passed，含生成契约一致性。
- `packages/app`: `bun typecheck` passed。
- `packages/app`: `RESEARCHOS_SKIP_PUBLIC=1 bun run build` passed，3217 modules transformed；Monaco 与 PDF.js worker/chunk 成功产出。
- 三个新 Skill：`quick_validate.py` 全部通过；preset JSON 解析通过。

Python Playwright 冒烟测试未执行：当前 Python 环境没有 `playwright` 模块。没有为此修改全局 Python 环境；生产构建和类型/契约测试已覆盖打包与静态集成。

## 剩余边界

- Tectonic 当前按 env、项目 bin、PATH 定位；Desktop 内置二进制属于 P6.5。
- 标题与结构的模型结果当前由侧栏复制作用域明确的 `@paper-writer` 提示到会话，不在侧栏内嵌流式会话；结果依然必须经过 diff review。
- TexLab LSP、协作编辑和 Overleaf 式远端编译不在 MVP 范围。
