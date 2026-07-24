import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { SCHEMA } from "./schema"
import { dbPath, graphDir } from "./paths"
import type { GraphNode, GraphEdge } from "./types"

export class GraphDB {
  private db: Database

  constructor(private projectRoot: string) {
    mkdirSync(graphDir(projectRoot), { recursive: true })
    this.db = new Database(dbPath(projectRoot), { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA foreign_keys = ON")
  }

  async init(): Promise<void> {
    const lines = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)
    for (const stmt of lines) {
      if (stmt.includes("VIRTUAL TABLE") && stmt.includes("vec0")) continue
      this.db.run(stmt + ";")
    }
  }

  upsertNodes(nodes: GraphNode[]): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO graph_node (id, type, label, ref_id, x, y) VALUES ($id, $type, $label, $refId, $x, $y)",
    )
    for (const n of nodes) {
      stmt.run({ $id: n.id, $type: n.type, $label: n.label, $refId: n.refId ?? null, $x: n.x, $y: n.y })
    }
    this.db.run("INSERT INTO graph_node_fts(graph_node_fts) VALUES ('rebuild')")
  }

  upsertEdges(edges: GraphEdge[]): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO graph_edge (from_node, to_node, relation) VALUES ($from, $to, $relation)",
    )
    for (const e of edges) {
      stmt.run({ $from: e.from, $to: e.to, $relation: e.relation })
    }
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare("SELECT * FROM graph_node WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: row.id as string,
      type: row.type as GraphNode["type"],
      label: row.label as string,
      refId: row.ref_id as string | null,
      x: (row.x as number) ?? 0,
      y: (row.y as number) ?? 0,
    }
  }

  getNeighbors(nodeId: string, depth: number = 1): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const visited = new Set<string>()
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }]
    visited.add(nodeId)

    while (queue.length > 0) {
      const current = queue.shift()!
      const node = this.getNode(current.id)
      if (node) nodes.set(node.id, node)
      if (current.d >= depth) continue

      const outEdges = this.db.prepare(
        "SELECT * FROM graph_edge WHERE from_node = ? OR to_node = ?",
      ).all(current.id, current.id) as Array<Record<string, unknown>>

      for (const row of outEdges) {
        edges.push({
          from: row.from_node as string,
          to: row.to_node as string,
          relation: row.relation as GraphEdge["relation"],
        })
        const neighborId = row.from_node === current.id ? row.to_node as string : row.from_node as string
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          queue.push({ id: neighborId, d: current.d + 1 })
        }
      }
    }

    return { nodes: Array.from(nodes.values()), edges }
  }

  searchNodes(query: string, limit: number = 20): GraphNode[] {
    const rows = this.db.prepare(
      "SELECT graph_node.* FROM graph_node JOIN graph_node_fts ON graph_node.rowid = graph_node_fts.rowid WHERE graph_node_fts MATCH ? LIMIT ?",
    ).all(query, limit) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: r.id as string,
      type: r.type as GraphNode["type"],
      label: r.label as string,
      refId: r.ref_id as string | null,
      x: (r.x as number) ?? 0,
      y: (r.y as number) ?? 0,
    }))
  }

  getAll(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = this.db.prepare("SELECT * FROM graph_node").all() as Array<Record<string, unknown>>
    const edges = this.db.prepare("SELECT * FROM graph_edge").all() as Array<Record<string, unknown>>
    return {
      nodes: nodes.map(mapNode),
      edges: edges.map((r) => ({
        from: r.from_node as string,
        to: r.to_node as string,
        relation: r.relation as GraphEdge["relation"],
      })),
    }
  }

  close(): void {
    this.db.close()
  }
}

function mapNode(r: Record<string, unknown>): GraphNode {
  return {
    id: r.id as string,
    type: r.type as GraphNode["type"],
    label: r.label as string,
    refId: r.ref_id as string | null,
    x: (r.x as number) ?? 0,
    y: (r.y as number) ?? 0,
  }
}
