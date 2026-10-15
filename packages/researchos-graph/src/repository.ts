import neo4j, { type Driver, type QueryResult, type Record as Neo4jRecord } from "neo4j-driver"
import { backendCredentials, loadGraphBackend } from "./backend"
import { SqliteStore, type Store } from "./store"
import type { GraphEdge, GraphNode, NodeType, Subgraph } from "./types"

export interface GraphRepository {
  readonly backend: "sqlite" | "neo4j" | "memgraph" | "tugraph"
  readonly projectRoot: string
  // 向量能力仅 sqlite 后端实现；Bolt 后端不实现即保持 FTS 降级
  readonly vecAvailable?: boolean
  hasEmbedding?(nodeId: string): boolean
  upsertEmbedding?(nodeId: string, embedding: number[]): void
  knn?(embedding: number[], k: number): Array<{ nodeId: string; distance: number }>
  upsertNodes(nodes: GraphNode[]): Promise<void>
  upsertEdges(edges: GraphEdge[]): Promise<void>
  replaceBySource(sourcePath: string, parsed: { nodes: GraphNode[]; edges: GraphEdge[] }): Promise<void>
  getNode(id: string): Promise<GraphNode | null>
  search(query: string, limit: number): Promise<GraphNode[]>
  all(filter?: { type?: NodeType }): Promise<Subgraph>
  neighbors(id: string, depth: number): Promise<Subgraph>
  saveLayout(positions: Array<{ id: string; x: number; y: number }>): Promise<void>
  close(): Promise<void>
}

export async function openRepository(projectRoot: string): Promise<GraphRepository> {
  const config = await loadGraphBackend(projectRoot)
  if (config.backend === "sqlite") return sqliteRepository(new SqliteStore(projectRoot))
  const credentials = backendCredentials(config)
  const driver = neo4j.driver(config.uri, credentials ? neo4j.auth.basic(credentials.username, credentials.password) : undefined as never)
  await driver.verifyConnectivity()
  return boltRepository(projectRoot, config.backend, driver, config.database)
}

function sqliteRepository(store: Store): GraphRepository {
  return {
    backend: "sqlite",
    projectRoot: store.projectRoot,
    get vecAvailable() {
      return store.vecAvailable
    },
    hasEmbedding: (nodeId) => store.hasEmbedding(nodeId),
    upsertEmbedding: (nodeId, embedding) => store.upsertEmbedding(nodeId, embedding),
    knn: (embedding, k) => store.knn(embedding, k),
    upsertNodes: async (nodes) => store.upsertNodes(nodes),
    upsertEdges: async (edges) => store.upsertEdges(edges),
    replaceBySource: async (sourcePath, parsed) => store.replaceBySource(sourcePath, parsed),
    getNode: async (id) => store.getNode(id),
    search: async (query, limit) => store.search(query, limit),
    all: async (filter) => store.all(filter),
    neighbors: async (id, depth) => store.neighbors(id, depth),
    saveLayout: async (positions) => store.saveLayout(positions),
    close: async () => store.close(),
  }
}

function boltRepository(projectRoot: string, backend: Exclude<GraphRepository["backend"], "sqlite">, driver: Driver, database?: string): GraphRepository {
  const execute = (query: string, parameters: Record<string, unknown> = {}) => driver.executeQuery(query, parameters, { database })
  return {
    backend,
    projectRoot,
    upsertNodes: async (nodes) => {
      if (!nodes.length) return
      await execute(`UNWIND $nodes AS input MERGE (n:ResearchOSNode {id: input.id}) SET n.type=input.type, n.label=input.label, n.refId=input.refId, n.sourcePath=input.sourcePath, n.attrs=input.attrs, n.x=input.x, n.y=input.y`, { nodes: wireNodes(nodes) })
    },
    upsertEdges: async (edges) => {
      if (!edges.length) return
      await execute(`UNWIND $edges AS input MATCH (a:ResearchOSNode {id: input.from}), (b:ResearchOSNode {id: input.to}) MERGE (a)-[r:RESEARCHOS_RELATION {relation: input.relation, sourcePath: input.sourcePath}]->(b) SET r.context=input.context`, { edges })
    },
    replaceBySource: async (sourcePath, parsed) => {
      await execute(`MATCH ()-[r:RESEARCHOS_RELATION {sourcePath: $sourcePath}]-() DELETE r`, { sourcePath })
      await execute(`MATCH (n:ResearchOSNode {sourcePath: $sourcePath}) DETACH DELETE n`, { sourcePath })
      if (parsed.nodes.length) {
        await execute(`UNWIND $nodes AS input MERGE (n:ResearchOSNode {id: input.id}) SET n.type=input.type, n.label=input.label, n.refId=input.refId, n.sourcePath=input.sourcePath, n.attrs=input.attrs, n.x=input.x, n.y=input.y`, { nodes: wireNodes(parsed.nodes) })
      }
      if (parsed.edges.length) {
        await execute(`UNWIND $edges AS input MATCH (a:ResearchOSNode {id: input.from}), (b:ResearchOSNode {id: input.to}) MERGE (a)-[r:RESEARCHOS_RELATION {relation: input.relation, sourcePath: input.sourcePath}]->(b) SET r.context=input.context`, { edges: parsed.edges })
      }
    },
    getNode: async (id) => {
      const result = await execute(`MATCH (n:ResearchOSNode {id: $id}) RETURN n`, { id })
      const node = result.records[0]?.get("n")
      return node ? mapNode(node.properties) : null
    },
    search: async (query, limit) => {
      const result = await execute(`MATCH (n:ResearchOSNode) WHERE toLower(n.label) CONTAINS toLower($query) RETURN n LIMIT $limit`, { query, limit })
      return result.records.map((record: Neo4jRecord) => mapNode(record.get("n").properties))
    },
    all: async (filter) => readGraph(execute, filter?.type ? `WHERE n.type = $type` : "", filter?.type ? { type: filter.type } : {}),
    neighbors: async (id, depth) => {
      const hops = Math.max(1, Math.min(2, depth))
      return readGraph(
        execute,
        `WHERE n.id IN [node IN nodes(path) | node.id]`,
        { id, hops },
        `MATCH path = (seed:ResearchOSNode {id: $id})-[*0..${hops}]-(n:ResearchOSNode)`,
      )
    },
    saveLayout: async (positions) => {
      if (!positions.length) return
      await execute(`UNWIND $positions AS input MATCH (n:ResearchOSNode {id: input.id}) SET n.x = input.x, n.y = input.y`, { positions })
    },
    close: async () => driver.close(),
  }
}

async function readGraph(
  execute: (query: string, parameters?: Record<string, unknown>) => Promise<QueryResult>,
  where: string,
  parameters: Record<string, unknown>,
  match = "MATCH (n:ResearchOSNode)",
): Promise<Subgraph> {
  const nodes = (await execute(`${match} ${where} RETURN DISTINCT n`, parameters)).records.map((record: Neo4jRecord) => mapNode(record.get("n").properties))
  const ids = nodes.map((node) => node.id)
  if (!ids.length) return { nodes, edges: [] }
  const edges = (await execute(`MATCH (a:ResearchOSNode)-[r:RESEARCHOS_RELATION]->(b:ResearchOSNode) WHERE a.id IN $ids AND b.id IN $ids RETURN a.id AS from, b.id AS to, r`, { ids })).records.map((record: Neo4jRecord) => ({
    from: record.get("from") as string,
    to: record.get("to") as string,
    relation: record.get("r").properties.relation as GraphEdge["relation"],
    context: record.get("r").properties.context ?? null,
    sourcePath: record.get("r").properties.sourcePath ?? null,
  }))
  return { nodes, edges }
}

function mapNode(input: Record<string, unknown>): GraphNode {
  return {
    id: input.id as string,
    type: input.type as NodeType,
    label: input.label as string,
    refId: input.refId as string | null,
    sourcePath: input.sourcePath as string | null,
    attrs: typeof input.attrs === "string" ? JSON.parse(input.attrs) : (input.attrs as Record<string, unknown>) ?? {},
    x: input.x as number | null,
    y: input.y as number | null,
  }
}

function wireNodes(nodes: GraphNode[]) {
  return nodes.map((node) => ({ ...node, attrs: JSON.stringify(node.attrs) }))
}
