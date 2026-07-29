import { Location } from "@opencode-ai/core/location"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import { createEmbedder, graphRag, modelsDir, openStore, type GraphEdge, type GraphNode, type Store } from "@researchos/graph"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

const stores = new Map<string, Store>()

export const ResearchosGraphHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-graph",
  (handlers) =>
    handlers
      .handle("graph.get", ({ query }) => response(withStore((store) =>
        Promise.resolve(wireSubgraph(store.all(query.type ? { type: query.type } : undefined))),
      )))
      .handle("graph.node", ({ query }) => response(withStore((store) => {
        const node = store.getNode(query.id)
        if (!node) throw new InvalidRequestError({ message: `Unknown graph node: ${query.id}` })
        const paper = node.refId ? store.paperMeta(node.refId) : undefined
        return Promise.resolve({
          node: wireNode(node),
          neighbors: wireSubgraph(store.neighbors(node.id, 1)),
          ...(paper
            ? {
              paper: {
                id: paper.id,
                title: paper.title,
                ...(paper.year ? { year: paper.year } : {}),
                ...(paper.doi ? { doi: paper.doi } : {}),
                authors: paper.authors,
                citationCount: paper.citationCount,
              },
            }
            : {}),
        })
      })))
      .handle("graph.ask", ({ payload }) => response(withStore(async (store) => {
        if (!payload.question.trim()) throw new InvalidRequestError({ message: "graph.ask requires a question" })
        const result = await graphRag(
          payload.question,
          payload.center_node || payload.depth
            ? { centerNode: payload.center_node, depth: payload.depth ?? 1 }
            : undefined,
          store,
          createEmbedder(modelsDir(store.projectRoot)),
        )
        return {
          subgraph: wireSubgraph(result.subgraph),
          contextPack: result.contextPack,
          seeds: result.seeds.map(wireNode),
          sources: result.subgraph.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            label: node.label,
            ...(node.refId ? { refId: node.refId } : {}),
          })),
          degraded: result.degraded,
          answer: "",
        }
      })))
      .handle("graph.save_layout", ({ payload }) => response(withStore((store) => {
        store.saveLayout(Array.from(payload.positions))
        return Promise.resolve({ ok: true })
      }))),
)

function withStore<T>(run: (store: Store) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const existing = stores.get(location.directory)
    const store = existing ?? openStore(location.directory)
    if (!existing) stores.set(location.directory, store)
    return yield* Effect.tryPromise({
      try: async () => run(store),
      catch: serverError,
    })
  })
}

function wireSubgraph(subgraph: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  return { nodes: subgraph.nodes.map(wireNode), edges: subgraph.edges.map(wireEdge) }
}

function wireNode(node: GraphNode) {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    ...(node.refId ? { refId: node.refId } : {}),
    ...(node.sourcePath ? { sourcePath: node.sourcePath } : {}),
    ...(Object.keys(node.attrs).length > 0 ? { attrs: node.attrs } : {}),
    ...(node.x !== null && node.x !== undefined ? { x: node.x } : {}),
    ...(node.y !== null && node.y !== undefined ? { y: node.y } : {}),
  }
}

function wireEdge(edge: GraphEdge) {
  return {
    from: edge.from,
    to: edge.to,
    relation: edge.relation,
    ...(edge.context ? { context: edge.context } : {}),
    ...(edge.sourcePath ? { sourcePath: edge.sourcePath } : {}),
  }
}

function serverError(error: unknown) {
  if (error instanceof InvalidRequestError) return error
  return new UnknownError({
    message: error instanceof Error ? error.message : String(error),
    ref: "researchos-graph",
  })
}
