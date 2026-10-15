import { Database, type SQLQueryBindings } from "bun:sqlite"
import { mkdirSync } from "fs"
import { getLoadablePath } from "sqlite-vec"
import { SCHEMA } from "./schema"
import { dbPath, literatureDir } from "./paths"
import type { PaperMeta, PaperCard, CitationEdge, CitationDirection, CitationEntry } from "./types"

export class LiteratureDB {
  private db: Database
  private vec = false

  constructor(private projectRoot: string) {
    mkdirSync(literatureDir(projectRoot), { recursive: true })
    const dp = dbPath(projectRoot)
    this.db = new Database(dp, { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA foreign_keys = ON")
  }

  get vecAvailable(): boolean {
    return this.vec
  }

  async init(): Promise<void> {
    const lines = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)
    for (const stmt of lines) {
      if (stmt.includes("VIRTUAL TABLE") && stmt.includes("vec0")) continue
      this.db.run(stmt + ";")
    }
    this.initVec()
  }

  private initVec(): void {
    // sqlite-vec 缺失或平台不支持时扩展加载失败：向量功能整体降级，不影响核心链路
    try {
      this.db.loadExtension(getLoadablePath())
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS paper_embedding USING vec0(paper_id TEXT PRIMARY KEY, embedding float[384])")
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS paper_chunk_embedding USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[384])")
      this.vec = true
    } catch {
      this.vec = false
    }
  }

  private requireVec(): void {
    if (!this.vec) throw new Error("sqlite-vec extension is not available; vector features are degraded")
  }

  upsertEmbedding(paperId: string, embedding: number[]): void {
    this.requireVec()
    // vec0 虚拟表不支持 UPSERT 语法，用 DELETE+INSERT 实现覆盖
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM paper_embedding WHERE paper_id = ?").run(paperId)
      this.db.prepare("INSERT INTO paper_embedding (paper_id, embedding) VALUES (?, ?)").run(paperId, new Float32Array(embedding))
    })()
  }

  getEmbedding(paperId: string): number[] | null {
    this.requireVec()
    const row = this.db.prepare("SELECT embedding FROM paper_embedding WHERE paper_id = ?").get(paperId) as
      | { embedding: Float32Array | Uint8Array }
      | undefined
    if (!row) return null
    if (row.embedding instanceof Float32Array) return Array.from(row.embedding)
    return Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4))
  }

  knn(embedding: number[], k: number): Array<{ paperId: string; distance: number }> {
    this.requireVec()
    return this.db.prepare(
      "SELECT paper_id AS paperId, distance FROM paper_embedding WHERE embedding MATCH ? AND k = ?",
    ).all(new Float32Array(embedding), k) as Array<{ paperId: string; distance: number }>
  }

  replaceChunks(paperId: string, chunks: Array<{ section: string | null; seq: number; text: string }>): void {
    this.db.transaction(() => {
      // vec0 无级联删除，先清掉旧 chunk 的向量行
      if (this.vec) {
        this.db.prepare(
          "DELETE FROM paper_chunk_embedding WHERE chunk_id IN (SELECT chunk_id FROM paper_chunk WHERE paper_id = ?)",
        ).run(paperId)
      }
      this.db.prepare("DELETE FROM paper_chunk WHERE paper_id = ?").run(paperId)
      const insert = this.db.prepare(
        "INSERT INTO paper_chunk (chunk_id, paper_id, section, seq, text) VALUES (?, ?, ?, ?, ?)",
      )
      chunks.forEach((chunk) => insert.run(`${paperId}:${chunk.seq}`, paperId, chunk.section, chunk.seq, chunk.text))
    })()
  }

  upsertChunkEmbeddings(rows: Array<{ chunkId: string; embedding: number[] }>): void {
    this.requireVec()
    // 与 upsertEmbedding 相同：vec0 不支持 UPSERT，用 DELETE+INSERT 覆盖
    this.db.transaction(() => {
      const del = this.db.prepare("DELETE FROM paper_chunk_embedding WHERE chunk_id = ?")
      const insert = this.db.prepare("INSERT INTO paper_chunk_embedding (chunk_id, embedding) VALUES (?, ?)")
      rows.forEach((row) => {
        del.run(row.chunkId)
        insert.run(row.chunkId, new Float32Array(row.embedding))
      })
    })()
  }

  knnChunks(
    embedding: number[],
    k: number,
    paperId?: string,
  ): Array<{ chunkId: string; paperId: string; section: string | null; text: string; seq: number; distance: number }> {
    this.requireVec()
    // 按 paper 过滤时多取一些再筛，避免 KNN 结果被其他论文占满
    const hits = this.db.prepare(
      "SELECT chunk_id AS chunkId, distance FROM paper_chunk_embedding WHERE embedding MATCH ? AND k = ?",
    ).all(new Float32Array(embedding), paperId ? k * 4 : k) as Array<{ chunkId: string; distance: number }>
    const lookup = this.db.prepare(
      "SELECT paper_id AS paperId, section, text, seq FROM paper_chunk WHERE chunk_id = ?",
    )
    return hits.flatMap((hit) => {
      const chunk = lookup.get(hit.chunkId) as
        | { paperId: string; section: string | null; text: string; seq: number }
        | undefined
      if (!chunk) return []
      if (paperId && chunk.paperId !== paperId) return []
      return [{ chunkId: hit.chunkId, ...chunk, distance: hit.distance }]
    }).slice(0, k)
  }

  chunksForPaper(paperId: string): Array<{ chunkId: string; section: string | null; seq: number; text: string }> {
    return this.db.prepare(
      "SELECT chunk_id AS chunkId, section, seq, text FROM paper_chunk WHERE paper_id = ? ORDER BY seq",
    ).all(paperId) as Array<{ chunkId: string; section: string | null; seq: number; text: string }>
  }

  chunkCount(paperId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM paper_chunk WHERE paper_id = ?").get(paperId) as { count: number }
    return row.count
  }

  coCitationCounts(paperId: string): Map<string, number> {
    const rows = this.db.prepare(`
      SELECT e2.from_id AS id, COUNT(*) AS shared
      FROM citation_edge e1
      JOIN citation_edge e2 ON e2.to_id = e1.to_id
      WHERE e1.from_id = ? AND e2.from_id != ?
      GROUP BY e2.from_id
    `).all(paperId, paperId) as Array<{ id: string; shared: number }>
    return new Map(rows.map((row) => [row.id, row.shared]))
  }

  insertPaper(paper: PaperMeta): void {
    this.db.transaction((value: PaperMeta) => {
      this.db.prepare(`
      INSERT INTO paper (id, doi, arxiv_id, title, year, venue, abstract, keywords,
        citation_count, pdf_path, source, is_read, is_favorite, notes_md, created_at, updated_at)
      VALUES ($id, $doi, $arxivId, $title, $year, $venue, $abstract, $keywords,
        $citationCount, $pdfPath, $source, $isRead, $isFavorite, $notesMd, $createdAt, $updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        doi = COALESCE(excluded.doi, paper.doi),
        arxiv_id = COALESCE(excluded.arxiv_id, paper.arxiv_id),
        title = excluded.title,
        year = COALESCE(excluded.year, paper.year),
        venue = COALESCE(excluded.venue, paper.venue),
        abstract = COALESCE(excluded.abstract, paper.abstract),
        keywords = CASE WHEN excluded.keywords = '[]' THEN paper.keywords ELSE excluded.keywords END,
        citation_count = MAX(excluded.citation_count, paper.citation_count),
        pdf_path = COALESCE(excluded.pdf_path, paper.pdf_path),
        source = excluded.source,
        is_read = MAX(excluded.is_read, paper.is_read),
        is_favorite = MAX(excluded.is_favorite, paper.is_favorite),
        notes_md = COALESCE(excluded.notes_md, paper.notes_md),
        updated_at = excluded.updated_at
    `).run({
        $id: value.id,
        $doi: value.doi ?? null,
        $arxivId: value.arxivId ?? null,
        $title: value.title,
        $year: value.year ?? null,
        $venue: value.venue ?? null,
        $abstract: value.abstract ?? null,
        $keywords: JSON.stringify(value.keywords),
        $citationCount: value.citationCount,
        $pdfPath: value.pdfPath ?? null,
        $source: value.source,
        $isRead: value.isRead ? 1 : 0,
        $isFavorite: value.isFavorite ? 1 : 0,
        $notesMd: value.notesMd ?? null,
        $createdAt: value.createdAt,
        $updatedAt: value.updatedAt,
      })
      this.db.prepare("DELETE FROM paper_author WHERE paper_id = ?").run(value.id)
      const upsertAuthor = this.db.prepare(`
        INSERT INTO author (name, affiliation) VALUES ($name, $affiliation)
        ON CONFLICT(name) DO UPDATE SET affiliation = COALESCE(excluded.affiliation, author.affiliation)
        RETURNING id
      `)
      const linkAuthor = this.db.prepare("INSERT INTO paper_author (paper_id, author_id, position) VALUES (?, ?, ?)")
      value.authors.forEach((author, position) => {
        const row = upsertAuthor.get({ $name: author.name, $affiliation: author.affiliation ?? null }) as { id: number }
        linkAuthor.run(value.id, row.id, position)
      })
    })(paper)
  }

  insertPapers(papers: PaperMeta[]): void {
    papers.forEach((paper) => this.insertPaper(paper))
  }

  insertExternalPapers(papers: Array<{ id: string; title?: string | null; year?: number | null; doi?: string | null }>): void {
    const stmt = this.db.prepare("INSERT OR IGNORE INTO external_paper (id, title, year, doi) VALUES (?, ?, ?, ?)")
    this.db.transaction((rows: typeof papers) => {
      rows.forEach((paper) => stmt.run(paper.id, paper.title ?? null, paper.year ?? null, paper.doi ?? null))
    })(papers)
  }

  insertCitationEdges(edges: CitationEdge[]): void {
    const stmt = this.db.prepare("INSERT OR IGNORE INTO citation_edge (from_id, to_id, context, source) VALUES (?, ?, ?, ?)")
    this.db.transaction((rows: CitationEdge[]) => {
      rows.forEach((edge) => stmt.run(edge.fromId, edge.toId, edge.context ?? null, edge.source))
    })(edges)
  }

  insertTags(paperId: string, names: string[]): void {
    const upsertTag = this.db.prepare("INSERT OR IGNORE INTO tag (name) VALUES (?)")
    const tagId = this.db.prepare("SELECT id FROM tag WHERE name = ?")
    const link = this.db.prepare("INSERT OR IGNORE INTO paper_tag (paper_id, tag_id) VALUES (?, ?)")
    this.db.transaction((tags: string[]) => {
      tags.forEach((name) => {
        upsertTag.run(name)
        const row = tagId.get(name) as { id: number } | undefined
        if (row) link.run(paperId, row.id)
      })
    })(names)
  }

  insertCollection(name: string, kind: string, query?: string): number {
    const existing = this.db.prepare("SELECT id FROM collection WHERE name = ? AND kind = ?").get(name, kind) as { id: number } | undefined
    if (existing) return existing.id
    return Number(this.db.prepare("INSERT INTO collection (name, kind, query) VALUES (?, ?, ?)").run(name, kind, query ?? null).lastInsertRowid)
  }

  addPaperToCollection(paperId: string, collectionId: number): void {
    this.db.prepare("INSERT OR IGNORE INTO paper_collection (paper_id, collection_id) VALUES (?, ?)").run(paperId, collectionId)
  }

  getCitations(paperId: string, direction: CitationDirection): CitationEntry[] {
    // direction 是联合类型，列名拼接无注入风险
    const [key, other] = direction === "references" ? ["from_id", "to_id"] : ["to_id", "from_id"]
    const rows = this.db.prepare(`
      SELECT e.${other} AS id, e.source AS edge_source,
        p.title AS p_title, p.year AS p_year, p.doi AS p_doi,
        ep.title AS ep_title, ep.year AS ep_year, ep.doi AS ep_doi
      FROM citation_edge e
      LEFT JOIN paper p ON p.id = e.${other}
      LEFT JOIN external_paper ep ON ep.id = e.${other}
      WHERE e.${key} = ?
    `).all(paperId) as Record<string, unknown>[]
    return rows.map((row) => ({
      id: row.id as string,
      title: (row.p_title ?? row.ep_title) as string | null,
      year: (row.p_year ?? row.ep_year) as number | null,
      doi: (row.p_doi ?? row.ep_doi) as string | null,
      source: row.edge_source as CitationEntry["source"],
      inLibrary: row.p_title !== null,
    }))
  }

  getExternalPaper(id: string): { id: string; title: string | null; year: number | null; doi: string | null } | null {
    const row = this.db.prepare("SELECT id, title, year, doi FROM external_paper WHERE id = ?").get(id) as
      | { id: string; title: string | null; year: number | null; doi: string | null }
      | undefined
    return row ?? null
  }

  getPaper(id: string): PaperMeta | null {
    const row = this.db.prepare("SELECT * FROM paper WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return { ...mapRow(row), authors: this.getPaperAuthors(id) }
  }

  listPapers(limit: number = 50, offset: number = 0): PaperCard[] {
    const rows = this.db.prepare(
      "SELECT id, title, year, venue, citation_count, is_read, is_favorite, source FROM paper ORDER BY year DESC, created_at DESC LIMIT ? OFFSET ?",
    ).all(limit, offset) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      year: r.year as number | null,
      venue: r.venue as string | null,
      authors: this.getPaperAuthors(r.id as string),
      citationCount: (r.citation_count as number) ?? 0,
      isRead: (r.is_read as number) === 1,
      isFavorite: (r.is_favorite as number) === 1,
      source: r.source as PaperCard["source"],
    }))
  }

  getPapers(ids: string[]): PaperMeta[] {
    return ids.flatMap((id) => {
      const paper = this.getPaper(id)
      return paper ? [paper] : []
    })
  }

  updatePaperFlags(id: string, flags: { isRead?: boolean; isFavorite?: boolean }): void {
    const clauses: string[] = []
    const values: SQLQueryBindings[] = []
    if (flags.isRead !== undefined) { clauses.push("is_read = ?"); values.push(flags.isRead ? 1 : 0) }
    if (flags.isFavorite !== undefined) { clauses.push("is_favorite = ?"); values.push(flags.isFavorite ? 1 : 0) }
    if (!clauses.length) return
    clauses.push("updated_at = ?")
    values.push(Date.now())
    values.push(id)
    this.db.run(`UPDATE paper SET ${clauses.join(", ")} WHERE id = ?`, values)
  }

  private getPaperAuthors(paperId: string): Array<{ name: string }> {
    const rows = this.db.prepare(`
      SELECT a.name FROM author a
      JOIN paper_author pa ON a.id = pa.author_id
      WHERE pa.paper_id = ?
      ORDER BY pa.position
    `).all(paperId) as Array<{ name: string }>
    return rows
  }

  searchLocal(query: string, limit: number = 20): PaperCard[] {
    const like = `%${query}%`
    const rows = this.db.prepare(
      "SELECT id, title, year, venue, citation_count, is_read, is_favorite, source FROM paper WHERE title LIKE ? OR abstract LIKE ? ORDER BY year DESC LIMIT ?",
    ).all(like, like, limit) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      year: r.year as number | null,
      venue: r.venue as string | null,
      authors: this.getPaperAuthors(r.id as string),
      citationCount: (r.citation_count as number) ?? 0,
      isRead: (r.is_read as number) === 1,
      isFavorite: (r.is_favorite as number) === 1,
      source: r.source as PaperCard["source"],
    }))
  }

  close(): void {
    this.db.close()
  }
}

function mapRow(row: Record<string, unknown>): PaperMeta {
  return {
    id: row.id as string,
    doi: row.doi as string | null,
    arxivId: row.arxiv_id as string | null,
    title: row.title as string,
    year: row.year as number | null,
    venue: row.venue as string | null,
    abstract: row.abstract as string | null,
    keywords: typeof row.keywords === "string" ? JSON.parse(row.keywords) : [],
    citationCount: (row.citation_count as number) ?? 0,
    pdfPath: row.pdf_path as string | null,
    source: row.source as PaperMeta["source"],
    isRead: (row.is_read as number) === 1,
    isFavorite: (row.is_favorite as number) === 1,
    notesMd: row.notes_md as string | null,
    authors: [],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}
