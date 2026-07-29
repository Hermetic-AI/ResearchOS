import { existsSync, readFileSync } from "fs"
import { resolve, sep } from "path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { createEmbedder, type Embedder } from "./embed"
import { modelsDir } from "./paths"
import { graphRag } from "./rag"
import { openStore, type Store } from "./store"
import { GraphEdge, GraphNode, NodeType } from "./types"
import { parseFile } from "./wikilink"

export function createGraphMcpServer(projectRoot: string, embedder?: Embedder | null) {
  const store = openStore(projectRoot)
  const server = new McpServer({ name: "researchos-graph", version: "0.1.0" })
  const rag = (question: string, scope?: { center_node?: string; depth?: number }) =>
    graphRag(
      question,
      scope ? { centerNode: scope.center_node, depth: scope.depth ?? 1 } : undefined,
      store,
      embedder === undefined ? createEmbedder(modelsDir(projectRoot)) : embedder,
    )

  server.registerTool("parse_wikilinks", {
    description: "Parse [[wikilinks]] and \\cite{} from Markdown/LaTeX files, upserting nodes and edges into the knowledge graph",
    inputSchema: { paths: z.array(z.string()).min(1) },
  }, async ({ paths }) => json(await parsePaths(paths, store, projectRoot)))

  server.registerTool("upsert", {
    description: "Idempotently upsert graph nodes and edges into the knowledge graph",
    inputSchema: { nodes: z.array(GraphNode).default([]), edges: z.array(GraphEdge).default([]) },
  }, (input) => {
    store.upsertNodes(input.nodes)
    store.upsertEdges(input.edges)
    return Promise.resolve(json({ ok: true, nodes: input.nodes.length, edges: input.edges.length }))
  })

  server.registerTool("query", {
    description: "Graph RAG: semantic recall + k-hop subgraph expansion for a natural language question",
    inputSchema: {
      question: z.string(),
      scope: z.object({
        center_node: z.string().optional(),
        depth: z.number().int().min(1).max(2).optional(),
      }).optional(),
    },
  }, ({ question, scope }) => rag(question, scope).then(json))

  server.registerTool("layout", {
    description: "Return nodes (with persisted x/y) and edges for frontend visualization",
    inputSchema: { filter: z.object({ type: NodeType.optional() }).optional() },
  }, ({ filter }) => Promise.resolve(json(store.all(filter))))

  return { server, store }
}

async function parsePaths(paths: string[], store: Store, projectRoot: string) {
  const results = paths.map((path) => {
    // 与文献导入一致的安全边界：文件路径必须解析后仍位于项目根内
    const resolved = resolve(projectRoot, path)
    if (!resolved.startsWith(resolve(projectRoot) + sep)) throw new Error(`Path escapes project root: ${path}`)
    if (!existsSync(resolved)) throw new Error(`File not found: ${path}`)
    const parsed = parseFile({
      path,
      content: readFileSync(resolved, "utf8"),
      citeKeyToPaperId: (key) => store.resolveCiteKey(key),
      existingNode: (id) => store.getNode(id),
    })
    store.replaceBySource(path, parsed)
    return { path, nodes: parsed.nodes.length, edges: parsed.edges.length }
  })
  return { files: results }
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] }
}

if (import.meta.main) {
  const { server } = createGraphMcpServer(process.env.RESEARCHOS_PROJECT_ROOT ?? process.cwd())
  await server.connect(new StdioServerTransport())
}
