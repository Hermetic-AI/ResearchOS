import { existsSync, readFileSync } from "fs"
import { resolve, sep } from "path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { createEmbedder, embedGraphNodes, type Embedder } from "./embed"
import { graphRag } from "./rag"
import { openRepository, type GraphRepository } from "./repository"
import { citeKeyResolver } from "./store"
import { modelsDir } from "./paths"
import { GraphEdge, GraphNode, NodeType } from "./types"
import { parseFile } from "./wikilink"

export async function createGraphMcpServer(projectRoot: string, embedder?: Embedder | null) {
  const repository = await openRepository(projectRoot)
  const server = new McpServer({ name: "researchos-graph", version: "0.1.0" })
  const rag = (question: string, scope?: { center_node?: string; depth?: number }) =>
    graphRag(
      question,
      scope ? { centerNode: scope.center_node, depth: scope.depth ?? 1 } : undefined,
      repository,
      embedder ?? null,
    )

  server.registerTool("parse_wikilinks", {
    description: "Parse [[wikilinks]] and \\cite{} from Markdown/LaTeX files, upserting nodes and edges into the knowledge graph",
    inputSchema: { paths: z.array(z.string()).min(1) },
  }, async ({ paths }) => json(await parsePaths(paths, repository, projectRoot)))

  server.registerTool("upsert", {
    description: "Idempotently upsert graph nodes and edges into the knowledge graph",
    inputSchema: { nodes: z.array(GraphNode).default([]), edges: z.array(GraphEdge).default([]) },
  }, async (input) => {
    await repository.upsertNodes(input.nodes)
    await repository.upsertEdges(input.edges)
    await embedGraphNodes(input.nodes, repository, embedder ?? null)
    return json({ ok: true, nodes: input.nodes.length, edges: input.edges.length })
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
  }, async ({ question, scope }) => {
    const result = await rag(question, scope)
    return json(result, {
      panel: "graph",
      resource: scope?.center_node ?? result.seeds[0]?.id,
      mode: "auto",
    })
  })

  server.registerTool("layout", {
    description: "Return nodes (with persisted x/y) and edges for frontend visualization",
    inputSchema: { filter: z.object({ type: NodeType.optional() }).optional() },
  }, async ({ filter }) => json(await repository.all(filter), { panel: "graph", mode: "badge" }))

  return { server, repository }
}

async function parsePaths(paths: string[], repository: GraphRepository, projectRoot: string) {
  // 每次调用取一份文献索引快照；[[citekey]] 解析为文献库 paper 节点而非 concept
  const resolveCiteKey = citeKeyResolver(projectRoot)
  const results = await Promise.all(paths.map(async (path) => {
    // 与文献导入一致的安全边界：文件路径必须解析后仍位于项目根内
    const resolved = resolve(projectRoot, path)
    if (!resolved.startsWith(resolve(projectRoot) + sep)) throw new Error(`Path escapes project root: ${path}`)
    if (!existsSync(resolved)) throw new Error(`File not found: ${path}`)
    const parsed = parseFile({
      path,
      content: readFileSync(resolved, "utf8"),
      citeKeyToPaperId: resolveCiteKey,
      existingNode: () => null,
    })
    await repository.replaceBySource(path, parsed)
    return { path, nodes: parsed.nodes.length, edges: parsed.edges.length }
  }))
  return { files: results }
}

function json(value: unknown, ui?: { panel: string; resource?: string; mode: "auto" | "confirm" | "badge" }) {
  const metadata = ui ? { "researchos.ui": ui } : undefined
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    ...(metadata ? { metadata } : {}),
  }
}

if (import.meta.main) {
  const root = process.env.RESEARCHOS_PROJECT_ROOT ?? process.cwd()
  const { server } = await createGraphMcpServer(root, createEmbedder(modelsDir(root)))
  await server.connect(new StdioServerTransport())
}
