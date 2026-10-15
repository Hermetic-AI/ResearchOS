# @researchos/writing

ResearchOS 论文写作助手后端：OpenCode plugin 包（**非** MCP server），承载确定性转换工具；标题/结构/润色/伪代码属 LLM 任务，走 preset 的 paper-writer SubAgent + Skill 池（`academic-polish`/`algo2e`）。核心纪律：所有 AI 修改经 diff review，本包不含任何静默改写文件的能力。

## Plugin 形态

默认导出 `PluginModule`（`{ id: "researchos-writing", server: WritingPlugin }`），preset `opencode.researchos.json` 的 `plugin` 键已声明。模型侧工具名即 tool key（无前缀）：

| 工具 | 说明 |
| --- | --- |
| `table_to_latex` | CSV（papaparse 真实解析）→ booktabs 表格：数值列右对齐、`% & _ #` 转义、caption/label |
| `md_to_latex` | markdown-it token 流白名单转换（标题/列表/代码/引用/GFM 表格/数学透传），不支持 token 降级 `% TODO` 注释 |
| `bibtex_upsert` | 解析现有 .bib 的 key，追加新条目跳过重复，返回 `{inserted, skipped}` |
| `bibtex_from_library` | 只读 P1 文献库（`.researchos/literature/literature.db`）取条目，用 `@researchos/literature` 的 `toBibtex` 生成 BibTeX |
| `suggest_record` | 写作建议与 review 结果落库 |

所有文件读写限项目根内（白名单）。

## 其他公开 API

- `wordDiff` / `splitSentences` / `hunksFromRewrite` / `applyHunks`（jsdiff 词级 diff + 句级 hunk 切分，供前端润色 review 与单测）。
- `WritingStore`：`.researchos/writing/writing.db`（设计 §5.2 三张表 writing_suggestion/writing_rewrite_hunk/writing_citation；设计原定写入 P1 researchos.db，实际该库不存在，为避免跨包写耦合改落本包独立库）。

## 测试

```bash
cd packages/researchos-writing
npx -y bun@1.3.14 test
npx -y bun@1.3.14 typecheck
```
