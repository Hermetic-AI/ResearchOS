# @researchos/latex

ResearchOS LaTeX 后端内核：Tectonic 编译管线（含结构化诊断）、SyncTeX 正反向解析、BibTeX/大纲解析、format_check 规则集、MCP stdio server。前端 Monaco/PDF 预览页未在本包范围。

## 公开 API

```ts
import { compile, locateTectonic, formatCheck, synctexQuery, parseBibtex, parseOutline, parseSynctex, parseTectonicLog } from "@researchos/latex"
```

- `locateTectonic(projectRoot)`：定位顺序 `RESEARCHOS_TECTONIC` env → `.researchos/latex/bin/tectonic(.exe)` → PATH；找不到返回 `null`。
- `compile({ projectRoot, mainFile, timeoutMs? })`：白名单校验 → 定位二进制 → `tectonic --keep-logs --synctex --outdir .researchos/latex/build <main>`（默认超时 120s）→ stderr 与 `.log` 双源诊断去重。二进制缺失返回 `{ available: false, message, installHint }`，绝不假装成功。
- `parseTectonicLog(log)`：`file:line:`/`error:`/`warning:` 行 + `.log` 的 `!`/`l.<n>` 行对 + Over/Underfull box → `LatexError[]`。
- `parseSynctex/forwardLookup/inverseLookup/loadSynctex`：`.synctex.gz`（Bun.gunzipSync）→ 记录索引；正向 file/line → page+pt 坐标，反向 page+pt → file/line（sp ÷ 65536 = pt）。
- `formatCheck({ projectRoot, mainFile, template? })`：规则集见下；`\input/\include` 链与 `\bibliography/\addbibresource` 自动收集，全部读取限项目根内。
- `synctexQuery(projectRoot, args)`：MCP/HTTP 共用的双向查询入口（`{found, reason?, ...}`）。
- `parseBibtex`（花括号配对扫描，支持嵌套/引号值/注释）、`extractCiteKeys`（cite/citet/citep/citealp/paraphrase 变体）、`parseOutline`。

## format_check 规则集

通用：`missing-cite-key`（error）、`unused-bib-entry`（info）、`unbalanced-braces`（error）、`figure-without-caption`/`figure-without-label`（warning）、`undefined-ref`（error）。
模板：`ieee` → `ieee-abstract-length` / `ieee-section-title-case` / `ieee-pagestyle`；`acm` → `acm-conference` / `acm-author-affiliation`。

## MCP server

`src/mcp.ts`（bun 直跑），工具 `compile` / `synctex` / `format_check`（模型侧 `researchos-latex_compile` 等），`RESEARCHOS_PROJECT_ROOT` 定位项目根（默认 `process.cwd()`）。

## 测试

```bash
cd packages/researchos-latex
npx -y bun@1.3.14 test        # 全离线；PATH 上存在 tectonic 时自动追加一个真实编译冒烟，不存在则跳过
npx -y bun@1.3.14 typecheck
```
