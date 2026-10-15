import type { Embedder } from "./embed"
import type { GraphEdge, GraphNode, GraphRagResult, RagScope, Subgraph } from "./types"

const TOP_K = 8
// 上下文打包的字符预算（粗算 4k 字符 ≈ 1k token）
const CONTEXT_BUDGET = 4000

type RagStore = {
  readonly vecAvailable?: boolean
  knn?(embedding: number[], k: number): Array<{ nodeId: string; distance: number }>
  getNode(id: string): GraphNode | null | Promise<GraphNode | null>
  search(query: string, limit: number): GraphNode[] | Promise<GraphNode[]>
  neighbors(id: string, depth: number): Subgraph | Promise<Subgraph>
}

export async function graphRag(
  question: string,
  scope: RagScope | undefined,
  store: RagStore,
  embedder: Embedder | null,
): Promise<GraphRagResult> {
  const depth = Math.min(2, Math.max(1, scope?.depth ?? 1))
  const recall = await recallSeeds(question, store, embedder)
  const seedIds = new Set([
    ...recall.nodes.map((node) => node.id),
    ...(scope?.centerNode ? [scope.centerNode] : []),
  ])
  const subgraph = mergeSubgraphs(await Promise.all(Array.from(seedIds, (id) => store.neighbors(id, depth))))
  return {
    subgraph,
    contextPack: buildContextPack(subgraph),
    seeds: recall.nodes,
    degraded: recall.degraded,
  }
}

async function recallSeeds(
  question: string,
  store: RagStore,
  embedder: Embedder | null,
): Promise<{ nodes: GraphNode[]; degraded: boolean }> {
  if (store.vecAvailable && embedder) {
    // 嵌入推理失败或召回为空时降级 FTS，不阻断查询
    const hits = await embedder([question])
      .then(([embedding]) => (embedding ? store.knn?.(embedding, TOP_K) ?? [] : []))
      .catch(() => [])
    const nodes = (await Promise.all(hits.map((hit) => store.getNode(hit.nodeId)))).filter(
      (node): node is GraphNode => node !== null,
    )
    if (nodes.length > 0) return { nodes, degraded: false }
  }
  return { nodes: await store.search(question, TOP_K), degraded: true }
}

function mergeSubgraphs(parts: Subgraph[]): Subgraph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  parts.forEach((part) => {
    part.nodes.forEach((node) => nodes.set(node.id, node))
    part.edges.forEach((edge) => edges.set(`${edge.from}${edge.to}${edge.relation}`, edge))
  })
  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) }
}

function buildContextPack(subgraph: Subgraph): string {
  const lines = [
    ...subgraph.nodes.map((node) => `[${node.type}] ${node.label} (${node.id})`),
    ...subgraph.edges.flatMap((edge) => {
      if (!edge.context) return []
      return [`${edge.from} —${edge.relation}→ ${edge.to}: ${edge.context}`]
    }),
  ]
  const packed: string[] = []
  let budget = CONTEXT_BUDGET
  lines.forEach((line) => {
    if (budget <= 0) return
    packed.push(line.slice(0, budget))
    budget -= line.length
  })
  return packed.join("\n")
}
