import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { LiteratureDB } from "../src/db"
import { importPaper, computePaperId, parsePdfMetadata } from "../src/import"
import { toBibtex, toRis, toEndnote, toMarkdown } from "../src/export"

function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "literature-test-"))
}

describe("LiteratureDB", () => {
  let db: LiteratureDB
  let dir: string

  beforeEach(async () => {
    dir = await tmpDir()
    db = new LiteratureDB(dir)
    await db.init()
  })

  afterEach(() => {
    db.close()
    rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("inserts and retrieves a paper", () => {
    const paper = {
      id: "test-001",
      title: "Attention Is All You Need",
      year: 2017,
      authors: [{ name: "Ashish Vaswani" }, { name: "Noam Shazeer" }],
      source: "arxiv" as const,
      doi: "10.48550/arXiv.1706.03762",
    }
    db.insertPaper(importPaperSync(paper))
    const result = db.getPaper("test-001")
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Attention Is All You Need")
    expect(result!.year).toBe(2017)
    expect(result!.authors.map((author) => author.name)).toEqual(["Ashish Vaswani", "Noam Shazeer"])
  })

  test("lists papers", () => {
    db.insertPaper(importPaperSync({ id: "p1", title: "Paper One", year: 2020, source: "arxiv" }))
    db.insertPaper(importPaperSync({ id: "p2", title: "Paper Two", year: 2021, source: "manual" }))
    const list = db.listPapers()
    expect(list.length).toBe(2)
  })

  test("local search finds paper by title", () => {
    db.insertPaper(importPaperSync({ id: "p1", title: "Attention Is All You Need", year: 2017, source: "arxiv" }))
    db.insertPaper(importPaperSync({ id: "p2", title: "BERT: Pre-training", year: 2018, source: "arxiv" }))
    const results = db.searchLocal("Attention")
    expect(results.length).toBe(1)
    expect(results[0]!.title).toBe("Attention Is All You Need")
  })
})

describe("importPaper", () => {
  test("computes paper ID from DOI", () => {
    const id = computePaperId("10.1234/test", null, "")
    expect(id.length).toBe(8)
  })

  test("parses PDF metadata for DOI", () => {
    const text = "10.48550/arXiv.1706.03762\nAttention Is All You Need\nAshish Vaswani et al\n2017"
    const meta = parsePdfMetadata(text)
    expect(meta.doi).toBe("10.48550/arXiv.1706.03762")
    expect(meta.year).toBe(2017)
  })
})

describe("export", () => {
  const paper = {
    id: "p1",
    title: "Attention Is All You Need",
    year: 2017,
    doi: "10.48550/arXiv.1706.03762",
    venue: "NeurIPS",
    authors: [{ name: "Ashish Vaswani", affiliation: null }, { name: "Noam Shazeer", affiliation: null }],
    source: "arxiv" as const,
    abstract: "The dominant sequence transduction models...",
    keywords: ["transformer", "attention"],
    citationCount: 100000,
    isRead: true,
    isFavorite: true,
    pdfPath: null,
    notesMd: null,
    arxivId: "1706.03762",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  test("generates BibTeX", () => {
    const bib = toBibtex(paper)
    expect(bib).toContain("@inproceedings{vaswani2017attention")
  })

  test("generates RIS", () => {
    const ris = toRis(paper)
    expect(ris).toContain("TY  - JOUR")
    expect(ris).toContain("TI  - Attention Is All You Need")
  })

  test("generates EndNote", () => {
    const endnote = toEndnote(paper)
    expect(endnote).toContain("%0 Journal Article")
  })

  test("generates Markdown", () => {
    const md = toMarkdown(paper)
    expect(md).toContain("# Attention Is All You Need")
    expect(md).toContain("**DOI**")
  })
})

function importPaperSync(p: {
  id: string
  title: string
  year?: number
  authors?: Array<{ name: string }>
  source: "arxiv" | "manual" | "semantic_scholar" | "crossref" | "pubmed" | "zotero"
  doi?: string
  arxivId?: string
  venue?: string
  abstract?: string
  keywords?: string[]
}) {
  const now = Date.now()
  return {
    id: p.id,
    doi: p.doi ?? null,
    arxivId: p.arxivId ?? null,
    title: p.title,
    year: p.year ?? null,
    venue: p.venue ?? null,
    abstract: p.abstract ?? null,
    keywords: p.keywords ?? [],
    citationCount: 0,
    pdfPath: null,
    source: p.source,
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: p.authors ?? [],
    createdAt: now,
    updatedAt: now,
  }
}
