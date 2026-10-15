import type { ServerResearchosGraphGetOutput } from "@opencode-ai/client"

export type GraphNodeData = ServerResearchosGraphGetOutput["data"]["nodes"][number]
export type GraphEdgeData = ServerResearchosGraphGetOutput["data"]["edges"][number]
export type NodeType = GraphNodeData["type"]
export type EdgeRelation = GraphEdgeData["relation"]

// 图谱色语义（UI 设计 §3.4）：主题无对应 token，在此一处集中定义
export const nodeColors: Record<NodeType, string> = {
  paper: "#61afef",
  concept: "#9d7cd8",
  note: "#fab283",
  repo: "#7fd88f",
}

export const edgeStyles: Record<EdgeRelation, { color: string; dash?: string; arrow?: boolean }> = {
  cites: { color: "#61afef" },
  mentions: { color: "#9d7cd8", dash: "6 4" },
  implements: { color: "#7fd88f", dash: "2 3" },
  evolves: { color: "#fab283", arrow: true },
}

export function finite(value: number | string | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return value
}
