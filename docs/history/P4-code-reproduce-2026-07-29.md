# P4.3 代码复现中心开发纪要（2026-07-29）

## 交付

- `@researchos/reproduce` 新增 WAL SQLite store，持久化 run、六步骤、paper/repro metrics 与 evidence-backed issues。
- 六步 runner 真实执行浅克隆、manifest/README 分析、Python/Docker 能力检测、环境策略生成、显式实验命令和 `metrics.json` 对齐。
- 实验命令必须由克隆仓库中的 `reproduce.json` 字符串数组声明；系统不猜测命令、不静默安装依赖。
- 失败步骤保存末尾日志并按 version/dependency/parameter/data 规则入库；前序步骤未完成时拒绝越级执行。
- Protocol/Server/Client 提供 list/create/get/advance/submit metrics/comparison/issues/cancel 八个接口；Client 已重新生成。
- MCP 提供 start/status/run_step/submit_paper_metrics/comparison/diagnose/cancel；Preset 新增 Reproduction Doctor 和 reproduce-paper Skill。
- App 替换定时器假成功页面，提供历史 run、显式步骤按钮、日志证据、论文指标录入、结果卡和诊断面板。

## 验证

- `@researchos/reproduce`: 7 tests passed。集成用例创建真实本地 Git 仓库，clone 后执行 Python，产出 metrics.json，完整六步完成并得到 match verdict。
- Reproduce、Protocol、Server、Client 与 App 类型检查通过；Protocol/Client 契约测试通过。
- App 生产构建通过。

## 边界

- v1 不自动安装依赖或构建 Docker image；环境策略会检测并记录能力，实际安装必须成为用户审阅过的显式命令。
- Cancel 对未开始/步骤间 run 是持久状态取消；长进程的跨 server 重启 PID 恢复留作增强。
- 论文指标由用户或 Agent 明确核验并提交，系统不从 URL 猜数值。
