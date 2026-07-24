import type { GraphNode, GraphEdge, GraphQueryResult } from "./types"

export function graphRagQuery(
  query: string,
  subgraph: { nodes: GraphNode[]; edges: GraphEdge[] },
): GraphQueryResult {
  const context = subgraph.nodes
    .map((n) => `[${n.type}] ${n.label} (${n.id})`)
    .join("\n")

  const answer = `Graph RAG stub: found ${subgraph.nodes.length} nodes and ${subgraph.edges.length} edges for query "${query}".

Subgraph context:
${context}`

  return {
    subgraph: { nodes: subgraph.nodes, edges: subgraph.edges },
    answer,
  }
}
