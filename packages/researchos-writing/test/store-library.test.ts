import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { bibtexFromLibrary } from "../src/library"
import { WritingStore } from "../src/store"

describe("WritingStore", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "writing-store-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("creates tables idempotently and records suggestions/hunks/citations", async () => {
    const first = new WritingStore(dir)
    first.close()
    // 第二次打开重跑 DDL 不报错（幂等）
    const store = new WritingStore(dir)
    const { id } = store.recordSuggestion({
      kind: "rewrite",
      targetFile: "paper/main.tex",
      inputExcerpt: "We use attention.",
      output: "Attention is employed.",
      status: "partial",
    })
    store.recordHunks(id, [{ hunkIndex: 0, original: "We use attention.", revised: "Attention is employed.", accepted: true, style: "passive" }])
    store.recordCitation({ texFile: "paper/main.tex", citeKey: "vaswani2017attention", paperId: "p1", contextHash: "abc" })
    store.recordCitation({ texFile: "paper/main.tex", citeKey: "vaswani2017attention", paperId: "p1", contextHash: "abc" })

    const suggestions = store.listSuggestions("rewrite")
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.status).toBe("partial")
    const db = new Database(join(dir, ".researchos", "writing", "writing.db"), { readonly: true })
    expect((db.prepare("SELECT COUNT(*) AS count FROM writing_rewrite_hunk").get() as { count: number }).count).toBe(1)
    expect((db.prepare("SELECT COUNT(*) AS count FROM writing_citation").get() as { count: number }).count).toBe(1)
    db.close()
    store.close()
  })
})

describe("bibtexFromLibrary", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "writing-library-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("returns BibTeX for stored papers and reports missing ids", async () => {
    const literatureDir = join(dir, ".researchos", "literature")
    await mkdir(literatureDir, { recursive: true })
    const db = new Database(join(literatureDir, "literature.db"), { create: true })
    db.exec(`
      CREATE TABLE paper (
        id TEXT PRIMARY KEY, doi TEXT, arxiv_id TEXT, title TEXT NOT NULL, year INTEGER,
        venue TEXT, abstract TEXT, keywords TEXT, citation_count INTEGER, pdf_path TEXT,
        source TEXT, is_read INTEGER, is_favorite INTEGER, notes_md TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE author (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, affiliation TEXT);
      CREATE TABLE paper_author (paper_id TEXT NOT NULL, author_id INTEGER NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (paper_id, author_id));
      INSERT INTO paper VALUES ('p1', '10.48550/arXiv.1706.03762', NULL, 'Attention Is All You Need', 2017, 'NeurIPS', NULL, '[]', 100, NULL, 'arxiv', 0, 0, NULL, 1, 1);
      INSERT INTO author (name) VALUES ('Ashish Vaswani');
      INSERT INTO paper_author VALUES ('p1', 1, 0);
    `)
    db.close()

    const result = bibtexFromLibrary(dir, ["p1", "missing"])
    expect(result.missing).toEqual(["missing"])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.key).toBe("vaswani2017attention")
    expect(result.entries[0]?.bibtex).toContain("@inproceedings{vaswani2017attention")
    expect(result.entries[0]?.bibtex).toContain("Attention Is All You Need")
  })

  test("returns all-missing when the library does not exist", () => {
    const result = bibtexFromLibrary(dir, ["p1"])
    expect(result.entries).toHaveLength(0)
    expect(result.missing).toEqual(["p1"])
  })
})
