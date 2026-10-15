# P6 产品整合与验收纪要（2026-07-29）

## 交付

- Project cockpit 替换硬编码论文/节点/文档数字，并行查询 Literature、Graph、LaTeX、Data、Plot、Reproduce 的真实持久数据；不可用模块不伪造计数。
- Sidebar module rail 覆盖 Overview、Literature、Graph、LaTeX、Data、Plot、Reproduce、Translation、Assets 九个入口。
- 新版会话 composer 增加 Research assets 快捷条，直接进入 Agent/Skill、文献、数据与 Figure 工作区；现有 slash command、Agent 与 MCP resource suggestion 机制保持不变。
- Desktop electron-builder 增加 `resources/tectonic/` 分发目录；打包运行时按 platform/arch 检测二进制并向内置 Server 注入 `RESEARCHOS_TECTONIC`，仍允许显式环境变量覆盖。
- App/Desktop 构建新增 `RESEARCHOS_SKIP_PUBLIC=1` 验证通道，仅用于当前 Windows 云占位 public 文件不可读场景；正常发布仍复制 public assets。

## 验证

- App typecheck 与生产构建通过（5441 modules）。
- Desktop typecheck、electron-builder 配置 5 tests、main/preload/renderer 全量生产构建通过（5463 renderer modules）。
- Desktop 首次构建的外部 `models.dev` 请求不可达，按仓库既有 `MODELS_DEV_API_JSON` 机制使用锁定测试快照后继续；public 云占位文件用上述验证开关绕过。
- Protocol/Client 契约、Server 类型检查以及 Plot/Reproduce/Translate 的 TS/Python 测试均在各自包目录通过。

## 发布要求

- 发布 CI 必须把校验过 checksum 的 Tectonic 上游二进制放入 `resources/tectonic/<platform>-<arch>/`。仓库只提交分发约定与运行时发现逻辑，不提交第三方可执行文件。
- 正式打包应在可读取真实 public 资产的 checkout 执行，不设置 `RESEARCHOS_SKIP_PUBLIC`。
