---
name: graph-rag
description: 基于课题知识图谱做语义查询（Graph RAG）。当用户提问涉及"哪些文献/概念/代码之间有关联""找出关于 X 的所有相关工作"时使用。
---

# Graph RAG 查询范式

1. 先调用 `researchos-graph_query`，传入用户原始问题；如涉及以某篇论文/概念为中心的探索，填 `scope.center_node`，`depth` 默认 1，跨主题探索用 2。
2. 工具返回 `{ subgraph, contextPack, seeds, degraded }`：
   - `seeds` 是向量/全文召回的种子节点，`subgraph` 是 k-hop 扩展结果，`contextPack` 是按边上下文拼好的证据片段。
   - `degraded: true` 表示 sqlite-vec 或嵌入模型不可用，召回走了 FTS 全文降级，结果相关性弱于向量召回，作答时向用户说明。
3. 作答要求：
   - 只依据 `contextPack` 与 `subgraph` 作答，不得引入图谱外的臆测。
   - 每个论断后用 `[[节点 label]]` 标注来源节点。
   - 列出子图中 `implements` 边指向的 repo 节点作为"对应代码实现"。
   - 若 `seeds` 为空，明确告知"图谱中尚无相关内容"，并建议先导入文献或让 graph SubAgent 建链。
4. 需要查看某节点全文时，用 Read 工具读其 `source_path` 对应文件，不要凭 label 猜测内容。
