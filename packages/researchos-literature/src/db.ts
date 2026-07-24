import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { SCHEMA } from "./schema"
import { dbPath, literatureDir } from "./paths"
import type { PaperMeta, PaperCard, CitationEdge } from "./types"

export class LiteratureDB {
  private db: Database

  constructor(private projectRoot: string) {
    mkdirSync(literatureDir(projectRoot), { recursive: true })
    const dp = dbPath(projectRoot)
    this.db = new Database(dp, { create: true })
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

  insertPaper(paper: PaperMeta): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO paper (id, doi, arxiv_id, title, year, venue, abstract, keywords,
        citation_count, pdf_path, source, is_read, is_favorite, notes_md, created_at, updated_at)
      VALUES ($id, $doi, $arxivId, $title, $year, $venue, $abstract, $keywords,
        $citationCount, $pdfPath, $source, $isRead, $isFavorite, $notesMd, $createdAt, $updatedAt)
    `)
    stmt.run({
      $id: paper.id,
      $doi: paper.doi ?? null,
      $arxivId: paper.arxivId ?? null,
      $title: paper.title,
      $year: paper.year ?? null,
      $venue: paper.venue ?? null,
      $abstract: paper.abstract ?? null,
      $keywords: JSON.stringify(paper.keywords),
      $citationCount: paper.citationCount,
      $pdfPath: paper.pdfPath ?? null,
      $source: paper.source,
      $isRead: paper.isRead ? 1 : 0,
      $isFavorite: paper.isFavorite ? 1 : 0,
      $notesMd: paper.notesMd ?? null,
      $createdAt: paper.createdAt,
      $updatedAt: paper.updatedAt,
    })
  }

  getPaper(id: string): PaperMeta | null {
    const row = this.db.prepare("SELECT * FROM paper WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return mapRow(row)
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
