import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "fs"
import { getLoadablePath } from "sqlite-vec"
import { dbPath, graphDir, literatureDbPath } from "./paths"
import type { GraphEdge, GraphNode, NodeType, Subgraph } from "./types"
import type { CiteKeyResolver } from "./wikilink"

// Kuzu 升级预留：所有存储访问收敛在 Store 接口（设计 §5.3）
export interface Store {
  readonly projectRoot: string
  readonly vecAvailable: boolean
  upsertNodes(nodes: GraphNode[]): void
  upsertEdges(edges: GraphEdge[]): void
  removeBySource(sourcePath: string): void
  replaceBySource(sourcePath: string, parsed: { nodes: GraphNode[]; edges: GraphEdge[] }): void
  neighbors(nodeId: string, depth: number): Subgraph
  search(query: string, limit: number): GraphNode[]
  all(filter?: { type?: NodeType }): Subgraph
  getNode(id: string): GraphNode | null
  hasEmbedding(nodeId: string): boolean
  upsertEmbedding(nodeId: string, embedding: number[]): void
  knn(embedding: number[], k: number): Array<{ nodeId: string; distance: number }>
  saveLayout(positions: Array<{ id: string; x: number; y: number }>): void
  resolveCiteKey(key: string): { nodeId: string; refId: string; label: string } | undefined
  paperMeta(refId: string): PaperMeta | undefined
  close(): void
}

export interface PaperMeta {
  id: string
  title: string
  year: number | null
  doi: string | null
  authors: string[]
  citationCount: number
}

const DDL = `
CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('paper','note','concept','repo')),
  label       TEXT NOT NULL,
  ref_id      TEXT,
  source_path TEXT,
  attrs       TEXT NOT NULL DEFAULT '{}',
  x           REAL,
  y           REAL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);

CREATE TABLE IF NOT EXISTS edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL CHECK (relation IN ('cites','mentions','implements','evolves')),
  source_path TEXT,
  context     TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE (from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);

CREATE VIRTUAL TABLE IF NOT EXISTS node_fts USING fts5(
  node_id UNINDEXED,
  label,
  body,
  tokenize = 'unicode61'
);
`

export class SqliteStore implements Store {
  private db: Database
  private vec = false

  constructor(readonly projectRoot: string) {
    mkdirSync(graphDir(projectRoot), { recursive: true })
    this.db = new Database(dbPath(projectRoot), { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec("PRAGMA foreign_keys = ON")
    DDL.split(";").map((stmt) => stmt.trim()).filter(Boolean).forEach((stmt) => this.db.run(stmt + ";"))
    this.initVec()
  }

  get vecAvailable(): boolean {
    return this.vec
  }

  private initVec(): void {
    // sqlite-vec 缺失或平台不支持时 Graph RAG 退化为 FTS-only（设计 §11）
    try {
      this.db.loadExtension(getLoadablePath())
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS node_vec USING vec0(node_id TEXT PRIMARY KEY, embedding FLOAT[384])")
      this.vec = true
    } catch {
      this.vec = false
    }
  }

  private requireVec(): void {
    if (!this.vec) throw new Error("sqlite-vec extension is not available; vector recall is degraded to FTS")
  }

  upsertNodes(nodes: GraphNode[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, type, label, ref_id, source_path, attrs, x, y, created_at, updated_at)
      VALUES ($id, $type, $label, $refId, $sourcePath, $attrs, $x, $y, $now, $now)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        ref_id = COALESCE(excluded.ref_id, nodes.ref_id),
        source_path = COALESCE(nodes.source_path, excluded.source_path),
        attrs = CASE WHEN excluded.attrs = '{}' THEN nodes.attrs ELSE excluded.attrs END,
        x = COALESCE(excluded.x, nodes.x),
        y = COALESCE(excluded.y, nodes.y),
        updated_at = excluded.updated_at
    `)
    const ftsDelete = this.db.prepare("DELETE FROM node_fts WHERE node_id = ?")
    const ftsInsert = this.db.prepare("INSERT INTO node_fts (node_id, label, body) VALUES (?, ?, ?)")
    this.db.transaction((rows: GraphNode[]) => {
      const now = Date.now()
      rows.forEach((node) => {
        stmt.run({
          $id: node.id,
          $type: node.type,
          $label: node.label,
          $refId: node.refId ?? null,
          $sourcePath: node.sourcePath ?? null,
          $attrs: JSON.stringify(node.attrs),
          $x: node.x ?? null,
          $y: node.y ?? null,
          $now: now,
        })
        ftsDelete.run(node.id)
        ftsInsert.run(node.id, node.label, ftsBody(node))
      })
    })(nodes)
  }

  upsertEdges(edges: GraphEdge[]): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO edges (from_id, to_id, relation, source_path, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    this.db.transaction((rows: GraphEdge[]) => {
      const now = Date.now()
      rows.forEach((edge) => stmt.run(edge.from, edge.to, edge.relation, edge.sourcePath ?? null, edge.context ?? null, now))
    })(edges)
  }

  removeBySource(sourcePath: string): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM edges WHERE source_path = ?").run(sourcePath)
      // 仅回收该文件独占产生的节点（别的文件也引用的保留）
      this.db.prepare(`
        DELETE FROM nodes WHERE source_path = ?
        AND NOT EXISTS (SELECT 1 FROM edges WHERE edges.from_id = nodes.id OR edges.to_id = nodes.id)
      `).run(sourcePath)
      this.db.prepare("DELETE FROM node_fts WHERE node_id = ?").run(sourcePath)
    })()
  }

  replaceBySource(sourcePath: string, parsed: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    // 文件级重解析：先删该文件的旧边再插入新结果，删除链接后边被回收；
    // 节点/边统一打上产生文件标记，upsert 的 COALESCE 语义保留最早产生者
    this.removeBySource(sourcePath)
    this.upsertNodes(parsed.nodes.map((node) => ({ ...node, sourcePath: node.sourcePath ?? sourcePath })))
    this.upsertEdges(parsed.edges.map((edge) => ({ ...edge, sourcePath: edge.sourcePath ?? sourcePath })))
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapNode(row) : null
  }

  neighbors(nodeId: string, depth: number): Subgraph {
    const nodes = new Map<string, GraphNode>()
    const edges = new Map<string, GraphEdge>()
    const visited = new Set<string>([nodeId])
    let frontier = [nodeId]
    const seed = this.getNode(nodeId)
    if (seed) nodes.set(seed.id, seed)
    Array.from({ length: Math.max(0, Math.min(2, depth)) }, (_, hop) => hop).forEach(() => {
      const rows = frontier.flatMap((id) =>
        (this.db.prepare("SELECT * FROM edges WHERE from_id = ? OR to_id = ?").all(id, id) as Array<Record<string, unknown>>)
          .map((row) => ({ row, id })),
      )
      frontier = rows.flatMap(({ row, id }) => {
        const edge = mapEdge(row)
        edges.set(`${edge.from}${edge.to}${edge.relation}`, edge)
        const neighborId = edge.from === id ? edge.to : edge.from
        if (visited.has(neighborId)) return []
        visited.add(neighborId)
        const neighbor = this.getNode(neighborId)
        if (neighbor) nodes.set(neighbor.id, neighbor)
        return [neighborId]
      })
    })
    return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) }
  }

  search(query: string, limit: number): GraphNode[] {
    const match = escapeFts(query)
    if (!match) return []
    const rows = this.db.prepare(`
      SELECT nodes.* FROM nodes
      JOIN node_fts ON node_fts.node_id = nodes.id
      WHERE node_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(match, limit) as Array<Record<string, unknown>>
    return rows.map(mapNode)
  }

  all(filter?: { type?: NodeType }): Subgraph {
    const nodeRows = (filter?.type
      ? this.db.prepare("SELECT * FROM nodes WHERE type = ?").all(filter.type)
      : this.db.prepare("SELECT * FROM nodes").all()) as Array<Record<string, unknown>>
    const nodes = nodeRows.map(mapNode)
    const ids = new Set(nodes.map((node) => node.id))
    const edges = (this.db.prepare("SELECT * FROM edges").all() as Array<Record<string, unknown>>)
      .map(mapEdge)
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    return { nodes, edges }
  }

  hasEmbedding(nodeId: string): boolean {
    if (!this.vec) return false
    return this.db.prepare("SELECT 1 FROM node_vec WHERE node_id = ?").get(nodeId) !== null
  }

  upsertEmbedding(nodeId: string, embedding: number[]): void {
    this.requireVec()
    // vec0 不支持 UPSERT，用 DELETE+INSERT 覆盖
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM node_vec WHERE node_id = ?").run(nodeId)
      this.db.prepare("INSERT INTO node_vec (node_id, embedding) VALUES (?, ?)").run(nodeId, new Float32Array(embedding))
    })()
  }

  knn(embedding: number[], k: number): Array<{ nodeId: string; distance: number }> {
    this.requireVec()
    return this.db.prepare(
      "SELECT node_id AS nodeId, distance FROM node_vec WHERE embedding MATCH ? AND k = ?",
    ).all(new Float32Array(embedding), k) as Array<{ nodeId: string; distance: number }>
  }

  saveLayout(positions: Array<{ id: string; x: number; y: number }>): void {
    const stmt = this.db.prepare("UPDATE nodes SET x = ?, y = ?, updated_at = ? WHERE id = ?")
    this.db.transaction((rows: typeof positions) => {
      const now = Date.now()
      rows.forEach((position) => stmt.run(position.x, position.y, now, position.id))
    })(positions)
  }

  resolveCiteKey(key: string): { nodeId: string; refId: string; label: string } | undefined {
    return citeKeyResolver(this.projectRoot)(key)
  }

  paperMeta(refId: string): PaperMeta | undefined {
    const path = literatureDbPath(this.projectRoot)
    if (!existsSync(path)) return undefined
    const literature = new Database(path, { readonly: true })
    try {
      const row = literature.prepare("SELECT id, title, year, doi, citation_count FROM paper WHERE id = ?").get(refId) as
        | { id: string; title: string; year: number | null; doi: string | null; citation_count: number | null }
        | undefined
      if (!row) return undefined
      const authors = literature.prepare(`
        SELECT a.name FROM author a
        JOIN paper_author pa ON pa.author_id = a.id
        WHERE pa.paper_id = ? ORDER BY pa.position
      `).all(refId) as Array<{ name: string }>
      return {
        id: row.id,
        title: row.title,
        year: row.year,
        doi: row.doi,
        authors: authors.map((author) => author.name),
        citationCount: row.citation_count ?? 0,
      }
    } finally {
      literature.close()
    }
  }

  close(): void {
    this.db.close()
  }
}

export function openStore(projectRoot: string): Store {
  return new SqliteStore(projectRoot)
}

// bibkey → 文献库条目的近似解析：DOI 规范化 > arXiv ID（忽略 vN 版本后缀）> bibtex key 惯例（作者姓+年份+标题首词）。
// 每个 reindex/parse 批次共享一份文献索引快照，避免按 key 反复打开库并全表扫描。
// 节点 id 固定为 paper:<文献库 id>，与读时合并的 literatureSubgraph（handler 侧 paperNode）保持一致，避免重复 paper 节点。
export function citeKeyResolver(projectRoot: string): CiteKeyResolver {
  const rows = loadLiteratureIndex(projectRoot)
  if (!rows) return () => undefined
  return (key) => {
    const normalized = key.trim().toLowerCase()
    const arxivKey = normalized.replace(/v\d+$/, "")
    const hit =
      rows.find((row) => row.doi?.toLowerCase() === normalized) ??
      rows.find((row) => row.arxiv_id?.toLowerCase().replace(/v\d+$/, "") === arxivKey) ??
      rows.find((row) => bibtexKeyMatches(row, normalized))
    return hit ? { nodeId: `paper:${hit.id}`, refId: hit.id, label: hit.title } : undefined
  }
}

function loadLiteratureIndex(projectRoot: string) {
  const path = literatureDbPath(projectRoot)
  if (!existsSync(path)) return undefined
  const literature = new Database(path, { readonly: true })
  try {
    return literature.prepare(`
      SELECT p.id, p.doi, p.arxiv_id, p.title, p.year,
        (SELECT a.name FROM author a JOIN paper_author pa ON pa.author_id = a.id
         WHERE pa.paper_id = p.id ORDER BY pa.position LIMIT 1) AS first_author
      FROM paper p
    `).all() as Array<{
      id: string
      doi: string | null
      arxiv_id: string | null
      title: string
      year: number | null
      first_author: string | null
    }>
  } finally {
    literature.close()
  }
}

function bibtexKeyMatches(
  row: { title: string; year: number | null; first_author: string | null },
  key: string,
): boolean {
  if (!row.year || !key.includes(String(row.year))) return false
  const family = row.first_author?.trim().split(/\s+/).at(-1)?.toLowerCase()
  if (!family || !key.startsWith(family)) return false
  const firstWord = row.title.toLowerCase().match(/[a-z]+/)?.[0]
  return firstWord ? key.includes(firstWord) : false
}

function ftsBody(node: GraphNode): string {
  const attrText = Object.values(node.attrs).filter((value) => typeof value === "string").join(" ")
  return [node.label, attrText].filter(Boolean).join(" ")
}

function escapeFts(query: string): string {
  // FTS5 查询语法字符按字面词处理，避免用户输入触发语法错误；无有效词时空调用方跳过
  const terms = query.match(/[\p{L}\p{N}_]+/gu) ?? []
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ")
}

function mapNode(row: Record<string, unknown>): GraphNode {
  return {
    id: row.id as string,
    type: row.type as GraphNode["type"],
    label: row.label as string,
    refId: row.ref_id as string | null,
    sourcePath: row.source_path as string | null,
    attrs: typeof row.attrs === "string" ? safeParse(row.attrs) : {},
    x: row.x as number | null,
    y: row.y as number | null,
  }
}

function mapEdge(row: Record<string, unknown>): GraphEdge {
  return {
    from: row.from_id as string,
    to: row.to_id as string,
    relation: row.relation as GraphEdge["relation"],
    context: row.context as string | null,
    sourcePath: row.source_path as string | null,
  }
}

function safeParse(attrs: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(attrs)
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
