import { Database } from "bun:sqlite"
import { existsSync } from "fs"
import { join } from "path"
import { toBibtex } from "@researchos/literature"
import type { PaperMeta } from "@researchos/literature"

// 引用助手的 BibTeX 数据源：只读 P1 文献库（graph 包 resolveCiteKey 同款先例），不重新发明查询
export function bibtexFromLibrary(
  projectRoot: string,
  paperIds: string[],
): { entries: Array<{ key: string; bibtex: string }>; missing: string[] } {
  const path = join(projectRoot, ".researchos", "literature", "literature.db")
  if (!existsSync(path)) return { entries: [], missing: paperIds }
  const db = new Database(path, { readonly: true })
  try {
    const found = paperIds.flatMap((id) => {
      const paper = readPaper(db, id)
      return paper ? [paper] : []
    })
    const foundIds = new Set(found.map((paper) => paper.id))
    return {
      entries: found.map((paper) => ({ key: bibtexKey(paper), bibtex: toBibtex(paper) })),
      missing: paperIds.filter((id) => !foundIds.has(id)),
    }
  } finally {
    db.close()
  }
}

function readPaper(db: Database, id: string): PaperMeta | null {
  const row = db.prepare("SELECT * FROM paper WHERE id = ?").get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const authors = db.prepare(`
    SELECT a.name FROM author a
    JOIN paper_author pa ON pa.author_id = a.id
    WHERE pa.paper_id = ? ORDER BY pa.position
  `).all(id) as Array<{ name: string }>
  return {
    id: row.id as string,
    doi: row.doi as string | null,
    arxivId: row.arxiv_id as string | null,
    title: row.title as string,
    year: row.year as number | null,
    venue: row.venue as string | null,
    abstract: row.abstract as string | null,
    keywords: [],
    citationCount: (row.citation_count as number) ?? 0,
    pdfPath: null,
    source: (row.source as PaperMeta["source"]) ?? "manual",
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: authors.map((author) => ({ name: author.name, affiliation: null })),
    createdAt: (row.created_at as number) ?? 0,
    updatedAt: (row.updated_at as number) ?? 0,
  }
}

// 与 literature export 的 key 生成保持一致（firstAuthor + year + 标题首词）
function bibtexKey(paper: PaperMeta): string {
  const firstAuthor = paper.authors[0]?.name.split(" ").at(-1)?.toLowerCase() ?? "unknown"
  const year = paper.year ?? "0000"
  const titleWord = paper.title.split(" ")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "untitled"
  return `${firstAuthor}${year}${titleWord}`
}
