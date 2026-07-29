# P4.1 数据分析 Notebook 开发纪要（2026-07-29）

## 交付

- `@researchos/data` 新增 notebooks/cells CRUD、执行结果持久化与 `KernelClient`。
- Python 新增持久 JSON-lines HTTP bridge；项目级 kernel broker 让 MCP Agent 与浏览器执行共用一个命名空间。Broker 仅监听 127.0.0.1，以随机 token 鉴权，启动用项目锁去重，30 分钟空闲退出。
- Protocol/Server/Client 新增 notebooks、cells list/create/save/run 五条路径；dataset 响应暴露已缓存 profile；Client 已重新生成。
- App `pages/data/` 替换假输出页面：轻量 textarea code cell、行号、保存、Ctrl/Cmd+Enter、状态/耗时/output，右侧 dataset/profile、stat tests、artifact preview、LaTeX snippet 与 experiment link 面板。
- SVG 产物通过 `img` data URL 渲染，不将后端 SVG 注入 DOM。
- 新增 `data-analysis` Skill，约束检验选择、效应量和可复现 notebook 顺序。

## 验证

- `@researchos/data`: 14 tests passed，含真实 Python 进程、跨 cell 变量与 SQLite cell 快照。
- Data MCP: Ruff passed；19 pytest passed，含两独立 broker 客户端共享变量。
- Client: 16 tests passed，含生成契约一致性。
- App: typecheck passed；生产构建 passed（3220 modules，使用 `RESEARCHOS_SKIP_PUBLIC=1` 绕过现有 Windows 云占位 public 资产）。
- Server/Protocol/Data/App 类型检查通过；新 Skill frontmatter 校验通过。

## 边界

- 当前由 repo 的 uv 锁定环境提供 Python 依赖；每课题独立 `.researchos/venv` 自举留给后续隔离增强。
- v1 是受控共享 `exec` kernel，不承诺 Jupyter rich display、变量检查或软中断；超时会重启 worker 并丢失命名空间。
- 内存/CPU 系统级强隔离与 Optuna 属 v2；当前硬保证为路径白名单、网络 monkey patch、超时和输出截断。
