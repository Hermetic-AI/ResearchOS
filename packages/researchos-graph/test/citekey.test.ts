import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm } from "fs/promises"
import { mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { citeKeyResolver } from "../src/store"
import { parseFile } from "../src/wikilink"

// 最小文献库 stub：只建 citeKeyResolver 查询用到的三张表
function seedLiteratureDb(dir: string) {
  mkdirSync(join(dir, ".researchos", "literature"), { recursive: true })
  const db = new Database(join(dir, ".researchos", "literature", "literature.db"), { create: true })
  db.exec(`
    CREATE TABLE paper (id TEXT PRIMARY KEY, doi TEXT, arxiv_id TEXT, title TEXT NOT NULL, year INTEGER);
    CREATE TABLE author (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE paper_author (paper_id TEXT NOT NULL, author_id INTEGER NOT NULL, position INTEGER NOT NULL);
  `)
  db.run("INSERT INTO paper (id, doi, arxiv_id, title, year) VALUES (?, ?, ?, ?, ?)", [
    "abc12345",
    "10.48550/arXiv.1706.03762",
    "1706.03762",
    "Attention Is All You Need",
    2017,
  ])
  db.run("INSERT INTO author (name) VALUES (?)", ["Ashish Vaswani"])
  db.run("INSERT INTO paper_author (paper_id, author_id, position) VALUES (?, ?, ?)", ["abc12345", 1, 0])
  db.run("INSERT INTO paper (id, doi, arxiv_id, title, year) VALUES (?, ?, ?, ?, ?)", [
    "def67890",
    null,
    null,
    "Some Other Paper",
    2020,
  ])
  db.run("INSERT INTO author (name) VALUES (?)", ["Jane Doe"])
  db.run("INSERT INTO paper_author (paper_id, author_id, position) VALUES (?, ?, ?)", ["def67890", 2, 0])
  db.close()
}

describe("citeKeyResolver", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-citekey-"))
    seedLiteratureDb(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("resolves arXiv ids with or without version suffix to the literature paper id", () => {
    const resolve = citeKeyResolver(dir)
    for (const key of ["1706.03762", "1706.03762v5"]) {
      expect(resolve(key)).toEqual({
        nodeId: "paper:abc12345",
        refId: "abc12345",
        label: "Attention Is All You Need",
      })
    }
  })

  test("resolves DOIs and bibtex-convention keys; node id stays paper:<literature id> for DOI papers", () => {
    const resolve = citeKeyResolver(dir)
    // 与读时合并的 literatureSubgraph（paperNode(paper.id, …) → paper:<id>）一致，合并后不会产生重复节点
    expect(resolve("10.48550/arXiv.1706.03762")?.nodeId).toBe("paper:abc12345")
    expect(resolve("vaswani2017attention")).toEqual({
      nodeId: "paper:abc12345",
      refId: "abc12345",
      label: "Attention Is All You Need",
    })
    expect(resolve("doe2020some")?.nodeId).toBe("paper:def67890")
    expect(resolve("unknownkey2099")).toBeUndefined()
  })

  test("returns undefined for every key when the project has no literature DB", async () => {
    const empty = await mkdtemp(join(tmpdir(), "graph-citekey-empty-"))
    try {
      expect(citeKeyResolver(empty)("1706.03762")).toBeUndefined()
    } finally {
      await rm(empty, { recursive: true, force: true }).catch(() => {})
    }
  })

  test("wired into parseFile: [[citekey]] wikilinks become paper nodes with refId and cites edges", () => {
    const parsed = parseFile({
      path: "notes/survey.md",
      content: "Transformers cite [[1706.03762v5]] and [[vaswani2017attention]], plus [[Missing Paper]].",
      citeKeyToPaperId: citeKeyResolver(dir),
    })
    const paper = parsed.nodes.find((node) => node.id === "paper:abc12345")
    expect(paper?.type).toBe("paper")
    expect(paper?.refId).toBe("abc12345")
    expect(paper?.label).toBe("Attention Is All You Need")
    // 重复的 bibkey/arxiv 指向同一篇文献，节点与边各只有一条
    expect(parsed.nodes.filter((node) => node.type === "paper")).toHaveLength(1)
    expect(parsed.edges).toHaveLength(2)
    const cite = parsed.edges.find((edge) => edge.to === "paper:abc12345")
    expect(cite?.from).toBe("note:notes/survey.md")
    expect(cite?.relation).toBe("cites")
    // 未命中的目标仍降级为 concept
    const concept = parsed.nodes.find((node) => node.id === "concept:missing-paper")
    expect(concept?.type).toBe("concept")
    expect(parsed.edges.find((edge) => edge.to === "concept:missing-paper")?.relation).toBe("mentions")
  })
})
