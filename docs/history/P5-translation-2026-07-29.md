# P5 全文翻译中心开发纪要（2026-07-29）

## 交付

- Python FastMCP 用 PyMuPDF 提取项目内 PDF 的有序文本块并识别 heading/caption/formula/paragraph；拒绝路径越界与无文本层 PDF。
- `@researchos/translate` 从 LiteratureDB 解析 paper 的归档 PDF，按标准章节切分，保护公式、数值单位与图表引用，再调用 `LIBRETRANSLATE_URL` 的真实 `/translate` API。
- 未配置翻译端点时返回可操作错误，不再使用乱码前缀或预置词表伪造翻译。
- 产物写入 `.researchos/translations/<paper_id>/`：source.md、translation.json、translation_zh.md、bilingual.html；HTML 对源文和译文安全转义。
- Protocol/Server/Client 提供 run/get；App 提供全文/摘要选择、归档加载及 source/target/bilingual 三态阅读。
- Preset 新增 Translator SubAgent，明确公式、数字、引用与术语一致性约束。

## 验证

- TS transform 4 tests passed；Python extractor 2 tests passed，Ruff passed。
- Translate、Protocol、Server、Client、App 类型检查与 Client 契约测试通过。
- App 生产构建通过。

## 边界

- v1 只实现英语到中文；扫描 PDF OCR 不在本期。
- 翻译 API 凭据和部署由用户配置，仓库不内置 key 或隐式收费调用。LLM 润色通过原生 Translator SubAgent 完成，不在工具里二次发起模型请求。
- 课题级人工术语 CRUD 与逐节异步 job 进度是后续增强；当前产物已保留结构化 JSON，便于迁移。
