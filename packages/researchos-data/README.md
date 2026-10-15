# @researchos/data

ResearchOS 数据分析中心的 TS 侧：产物库（SQLite）+ 类型契约 + 产物文件管理，供 server handler 与前端消费。五工具本体（run_python/profile/stat_test/chart/link_experiment）在 Python FastMCP server（`packages/researchos-mcp/data`），两侧经 `.researchos/data-analysis.db`（WAL + busy_timeout）共享读写。

## 存储布局（与模块文档 §5.1 一致）

- `.researchos/data-analysis.db`：datasets / notebooks / cells / artifacts / artifact_links / stat_tests / meta（DDL 与 Python 侧 `db.py` 逐字一致）。
- `.researchos/artifacts/`：图表与统计产物；`readArtifactFile` 白名单限该目录内。

## 公开 API

- `DataStore`（bun:sqlite）：`registerDataset`（按 path 幂等 + profile 缓存）、`registerArtifact` / `getArtifact(ByPath)` / `listArtifacts`、`recordStatTest` / `listStatTests`、`linkArtifact`（git HEAD 缺省、tex 章节扫描 warning、三元 upsert）、`readArtifactFile`、`getMeta/setMeta`。
- `contract.ts`：五个 MCP 工具的 zod 契约（RunPython/Profile/StatTest/Chart/LinkExperiment），MCP server、handler、SubAgent prompt 共用。

## 测试

```bash
cd packages/researchos-data
npx -y bun@1.3.14 test
npx -y bun@1.3.14 typecheck
```
