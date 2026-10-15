import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import { checkBoltBackend, citeKeyResolver, createEmbedder, embedGraphNodes, graphRag, loadGraphBackend, modelsDir, openRepository, openStore, parseFile, type Embedder, type GraphEdge, type GraphNode, type GraphRepository, type Store, type Subgraph } from "@researchos/graph"
import { dbPath, LiteratureDB } from "@researchos/literature"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

const stores = new Map<string, Store>()
const repositories = new Map<string, Promise<GraphRepository>>()
const embedders = new Map<string, Embedder | null>()

// createEmbedder 本身惰性加载模型；此处缓存实例避免每次 ask 重建，并防构造抛错
function embedderFor(directory: string): Embedder | null {
  if (!embedders.has(directory)) {
    try {
      embedders.set(directory, createEmbedder(modelsDir(directory)))
    } catch {
      embedders.set(directory, null)
    }
  }
  return embedders.get(directory) ?? null
}

export const ResearchosGraphHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-graph",
  (handlers) =>
    handlers
      .handle("graph.status", () => response(Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* Effect.tryPromise({
          try: async () => {
            const config = await loadGraphBackend(location.directory)
            if (config.backend === "sqlite") return { backend: "sqlite" as const, healthy: true, detail: "Project-local SQLite" }
            const info = await checkBoltBackend(config)
            return { backend: config.backend, healthy: true, detail: `${info.agent} at ${info.address}` }
          },
          catch: serverError,
        })
      })))
      .handle("graph.get", ({ query }) => response(Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* withRepository(async (repository) => {
          // 文献库在读时合并进图谱：paper 节点与 cites 边以文献库为准，避免双写
          const merged = mergeSubgraphs(await repository.all(), await literatureSubgraph(location.directory))
          return wireSubgraph(query.type ? filterByType(merged, query.type) : merged)
        })
      })))
      .handle("graph.node", ({ query }) => response(Effect.gen(function* () {
        const location = yield* Location.Service
        return yield* withRepository(async (repository) => {
          const node = await repository.getNode(query.id)
          if (node) return {
            node: wireNode(node),
            neighbors: wireSubgraph(await repository.neighbors(node.id, 1)),
          }
          const fromLibrary = await literatureNodeDetail(location.directory, query.id)
          if (!fromLibrary) throw new InvalidRequestError({ message: `Unknown graph node: ${query.id}` })
          return fromLibrary
        })
      })))
      .handle("graph.ask", ({ payload }) => response(withRepository(async (repository, directory) => {
        if (!payload.question.trim()) throw new InvalidRequestError({ message: "graph.ask requires a question" })
        const result = await graphRag(
          payload.question,
          payload.center_node || payload.depth
            ? { centerNode: payload.center_node, depth: payload.depth ?? 1 }
            : undefined,
          repository,
          embedderFor(directory),
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
      .handle("graph.reindex", () => response(withRepository(async (repository) => {
        const files: string[] = []
        const seen = new Set<string>()
        const parsedNodes: GraphNode[] = []
        // 整个 reindex 共享一份文献索引快照；[[citekey]] 解析为文献库 paper 节点而非 concept
        const resolveCiteKey = citeKeyResolver(repository.projectRoot)
        for (const pattern of ["*.md", "*.tex", "*.latex", "**/*.md", "**/*.tex", "**/*.latex"]) {
          for await (const file of new Bun.Glob(pattern).scan({ cwd: repository.projectRoot, onlyFiles: true })) {
            if (file.split(/[\\/]/).some((part) => part === "node_modules" || part === ".git" || part === ".researchos")) continue
            const content = await Bun.file(`${repository.projectRoot}/${file}`).text()
            const sourcePath = file.replaceAll("\\", "/")
            if (seen.has(sourcePath)) continue
            seen.add(sourcePath)
            const parsed = parseFile({
              path: sourcePath,
              content,
              citeKeyToPaperId: resolveCiteKey,
            existingNode: () => null,
          })
            await repository.replaceBySource(sourcePath, parsed)
            parsedNodes.push(...parsed.nodes)
            files.push(sourcePath)
          }
        }
        // 向量回填失败不阻断 reindex（embedGraphNodes 内部静默降级）
        await embedGraphNodes(parsedNodes, repository, embedderFor(repository.projectRoot))
        const graph = await repository.all()
        return { files, nodes: graph.nodes.length, edges: graph.edges.length }
      })))
      .handle("graph.save_layout", ({ payload }) => response(withRepository(async (repository) => {
        await repository.saveLayout(Array.from(payload.positions))
        return { ok: true }
      }))),
)

function withRepository<T>(run: (repository: GraphRepository, directory: string) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const existing = repositories.get(location.directory)
    const repository = yield* Effect.tryPromise({ try: () => existing ?? openRepository(location.directory), catch: serverError })
    if (!existing) repositories.set(location.directory, Promise.resolve(repository))
    return yield* Effect.tryPromise({ try: () => run(repository, location.directory), catch: serverError })
  })
}

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

const literatureDbs = new Map<string, Promise<LiteratureDB | null>>()

// 只在项目已有文献库时打开，避免仅查看图谱就为项目创建空库
function openLiterature(directory: string) {
  const existing = literatureDbs.get(directory)
  if (existing) return existing
  const created = (async (): Promise<LiteratureDB | null> => {
    if (!(await Bun.file(dbPath(directory)).exists())) return null
    const db = new LiteratureDB(directory)
    await db.init()
    return db
  })()
  literatureDbs.set(directory, created)
  return created
}

function paperNode(id: string, label: string, refId: string | null, attrs: Record<string, unknown>): GraphNode {
  return { id: `paper:${id}`, type: "paper", label, refId, sourcePath: null, attrs, x: null, y: null }
}

function paperAttrs(paper: { year?: number | null; venue?: string | null }) {
  return {
    ...(paper.year ? { year: paper.year } : {}),
    ...(paper.venue ? { venue: paper.venue } : {}),
  }
}

async function literatureSubgraph(directory: string): Promise<Subgraph> {
  const db = await openLiterature(directory)
  if (!db) return { nodes: [], edges: [] }
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const papers = db.listPapers(1000)
  for (const paper of papers) {
    nodes.set(`paper:${paper.id}`, paperNode(paper.id, paper.title, paper.id, paperAttrs(paper)))
  }
  for (const paper of papers) {
    for (const cite of db.getCitations(paper.id, "references")) {
      if (!nodes.has(`paper:${cite.id}`)) {
        nodes.set(`paper:${cite.id}`, paperNode(cite.id, cite.title ?? cite.id, cite.inLibrary ? cite.id : null, cite.inLibrary ? {} : { external: true }))
      }
      edges.set(`paper:${paper.id}->paper:${cite.id}`, {
        from: `paper:${paper.id}`,
        to: `paper:${cite.id}`,
        relation: "cites",
        context: null,
        sourcePath: null,
      })
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

async function literatureNodeDetail(directory: string, id: string) {
  if (!id.startsWith("paper:")) return null
  const db = await openLiterature(directory)
  if (!db) return null
  const paperId = id.slice("paper:".length)
  const paper = db.getPaper(paperId)
  // 外部论文只存在于 external_paper/citation_edge，不在库内，退化为仅展示引用邻居
  const external = paper ? null : db.getExternalPaper(paperId)
  const references = db.getCitations(paperId, "references")
  const citedBy = db.getCitations(paperId, "cited_by")
  if (!paper && !external && references.length === 0 && citedBy.length === 0) return null
  const self = paper
    ? paperNode(paper.id, paper.title, paper.id, paperAttrs(paper))
    : paperNode(paperId, external?.title ?? paperId, null, { external: true, ...(external?.year ? { year: external.year } : {}) })
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  for (const cite of references) {
    nodes.set(`paper:${cite.id}`, paperNode(cite.id, cite.title ?? cite.id, cite.inLibrary ? cite.id : null, cite.inLibrary ? {} : { external: true }))
    edges.push({ from: self.id, to: `paper:${cite.id}`, relation: "cites", context: null, sourcePath: null })
  }
  for (const cite of citedBy) {
    nodes.set(`paper:${cite.id}`, paperNode(cite.id, cite.title ?? cite.id, cite.inLibrary ? cite.id : null, cite.inLibrary ? {} : { external: true }))
    edges.push({ from: `paper:${cite.id}`, to: self.id, relation: "cites", context: null, sourcePath: null })
  }
  return {
    node: wireNode(self),
    neighbors: wireSubgraph({ nodes: [...nodes.values()], edges }),
    ...(paper ? {
      paper: {
        id: paper.id,
        title: paper.title,
        ...(paper.year ? { year: paper.year } : {}),
        ...(paper.doi ? { doi: paper.doi } : {}),
        authors: paper.authors.map((author) => author.name),
        citationCount: paper.citationCount,
      },
    } : {}),
  }
}

function mergeSubgraphs(base: Subgraph, extra: Subgraph): Subgraph {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]))
  for (const node of extra.nodes) {
    if (!nodes.has(node.id)) nodes.set(node.id, node)
  }
  const edges = new Map(base.edges.map((edge) => [`${edge.from}${edge.to}${edge.relation}`, edge]))
  for (const edge of extra.edges) {
    const key = `${edge.from}${edge.to}${edge.relation}`
    if (!edges.has(key)) edges.set(key, edge)
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

function filterByType(subgraph: Subgraph, type: GraphNode["type"]): Subgraph {
  const nodes = subgraph.nodes.filter((node) => node.type === type)
  const ids = new Set(nodes.map((node) => node.id))
  return { nodes, edges: subgraph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) }
}
