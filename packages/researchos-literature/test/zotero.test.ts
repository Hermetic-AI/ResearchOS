import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { LiteratureDB } from "../src/db"
import { computePaperId } from "../src/import"
import { dbPath } from "../src/paths"
import { importZotero } from "../src/zotero"
import { makePdf } from "./fixtures/pdf"

const SCHEMA = `
CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
CREATE TABLE items (itemID INTEGER PRIMARY KEY, itemTypeID INTEGER, key TEXT);
CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INTEGER);
CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER);
CREATE TABLE tags (tagID INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE itemTags (itemID INTEGER, tagID INTEGER);
CREATE TABLE collections (collectionID INTEGER PRIMARY KEY, collectionName TEXT);
CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
CREATE TABLE itemAttachments (itemID INTEGER, parentItemID INTEGER, linkMode INTEGER, contentType TEXT, path TEXT);
`

// 最小 Zotero 库：两篇文献（各带作者/标签/集合），一篇带真实 PDF 附件，一篇带缺失附件
function createZoteroFixture(dir: string, options: { crippled?: boolean } = {}) {
  const sqlite = new Database(join(dir, "zotero.sqlite"), { create: true })
  sqlite.exec(options.crippled
    ? `
      CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
      CREATE TABLE items (itemID INTEGER PRIMARY KEY, itemTypeID INTEGER, key TEXT);
      CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
      CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
      CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
      CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT, fieldMode INTEGER);
      CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER);
    `
    : SCHEMA)
  const run = (sql: string, ...params: Array<string | number>) => sqlite.run(sql, params)

  run("INSERT INTO itemTypes VALUES (1, 'journalArticle')")
  run("INSERT INTO itemTypes VALUES (2, 'conferencePaper')")
  run("INSERT INTO itemTypes VALUES (3, 'attachment')")
  run("INSERT INTO itemTypes VALUES (4, 'note')")
  ;["title", "DOI", "date", "publicationTitle", "extra", "abstractNote"].forEach((name, i) =>
    run("INSERT INTO fields VALUES (?, ?)", i + 1, name))
  const field = (itemId: number, fieldId: number, value: string) => {
    run("INSERT INTO itemDataValues VALUES (?, ?)", itemId * 100 + fieldId, value)
    run("INSERT INTO itemData VALUES (?, ?, ?)", itemId, fieldId, itemId * 100 + fieldId)
  }

  run("INSERT INTO items VALUES (100, 1, 'ABCD1234')")
  field(100, 1, "Deep Residual Learning for Image Recognition")
  field(100, 2, "10.1109/CVPR.2016.90")
  field(100, 3, "2016-06-01")
  field(100, 4, "IEEE Conference on Computer Vision and Pattern Recognition")
  field(100, 5, "arXiv: 1512.03385")
  field(100, 6, "Deeper neural networks are more difficult to train.")

  run("INSERT INTO items VALUES (101, 2, 'EFGH5678')")
  field(101, 1, "Test-Time Training on Video Streams")
  field(101, 3, "2023")
  field(101, 4, "International Conference on Machine Learning")

  run("INSERT INTO creators VALUES (1, 'Kaiming', 'He', 0)")
  run("INSERT INTO creators VALUES (2, 'Xiangyu', 'Zhang', 0)")
  run("INSERT INTO creators VALUES (3, '', 'OpenAI', 1)")
  if (!options.crippled) run("INSERT INTO creatorTypes VALUES (1, 'author')")
  run("INSERT INTO itemCreators VALUES (100, 1, 1, 0)")
  run("INSERT INTO itemCreators VALUES (100, 2, 1, 1)")
  run("INSERT INTO itemCreators VALUES (101, 3, 1, 0)")

  if (options.crippled) {
    sqlite.close()
    return
  }
  run("INSERT INTO tags VALUES (1, 'vision')")
  run("INSERT INTO tags VALUES (2, 'transformer')")
  run("INSERT INTO itemTags VALUES (100, 1)")
  run("INSERT INTO itemTags VALUES (101, 2)")
  run("INSERT INTO collections VALUES (1, 'Thesis References')")
  run("INSERT INTO collectionItems VALUES (1, 100)")
  run("INSERT INTO collectionItems VALUES (1, 101)")
  run("INSERT INTO items VALUES (200, 3, 'ATT00001')")
  run("INSERT INTO itemAttachments VALUES (200, 100, 0, 'application/pdf', 'storage:resnet.pdf')")
  run("INSERT INTO items VALUES (202, 3, 'ATT00002')")
  run("INSERT INTO itemAttachments VALUES (202, 101, 0, 'application/pdf', 'storage:missing.pdf')")
  run("INSERT INTO items VALUES (300, 4, 'NOTE0001')")
  sqlite.close()
}

describe("importZotero", () => {
  let zoteroDir: string
  let projectRoot: string
  let db: LiteratureDB

  beforeEach(async () => {
    zoteroDir = await mkdtemp(join(tmpdir(), "zotero-fixture-"))
    projectRoot = await mkdtemp(join(tmpdir(), "zotero-project-"))
    db = new LiteratureDB(projectRoot)
    await db.init()
  })

  afterEach(async () => {
    db.close()
    await rm(zoteroDir, { recursive: true, force: true }).catch(() => {})
    await rm(projectRoot, { recursive: true, force: true }).catch(() => {})
  })

  test("imports items with authors, tags, collections and archives the PDF attachment", async () => {
    createZoteroFixture(zoteroDir)
    await mkdir(join(zoteroDir, "storage", "ATT00001"), { recursive: true })
    await writeFile(join(zoteroDir, "storage", "ATT00001", "resnet.pdf"), makePdf([["ResNet PDF"]]))

    const report = await importZotero(join(zoteroDir, "zotero.sqlite"), { projectRoot, db })
    expect(report.imported).toBe(2)
    expect(report.skipped).toBe(0)
    expect(report.pdfsCopied).toBe(1)
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toContain("missing.pdf")

    const id = computePaperId("10.1109/cvpr.2016.90", null, "")
    const paper = db.getPaper(id)
    expect(paper?.title).toBe("Deep Residual Learning for Image Recognition")
    expect(paper?.year).toBe(2016)
    expect(paper?.venue).toBe("IEEE Conference on Computer Vision and Pattern Recognition")
    expect(paper?.arxivId).toBe("1512.03385")
    expect(paper?.source).toBe("zotero")
    expect(paper?.authors.map((author) => author.name)).toEqual(["Kaiming He", "Xiangyu Zhang"])
    expect(paper?.pdfPath).toBe(`pdfs/2016/${id}.pdf`)
    expect(await Bun.file(join(projectRoot, ".researchos", "literature", "pdfs", "2016", `${id}.pdf`)).exists()).toBe(true)

    // 标签与集合直接查 SQLite 断言（内核暂无读取方法）
    const library = new Database(dbPath(projectRoot), { readonly: true })
    const tags = library.prepare(
      "SELECT t.name FROM tag t JOIN paper_tag pt ON pt.tag_id = t.id WHERE pt.paper_id = ?",
    ).all(id) as Array<{ name: string }>
    expect(tags.map((tag) => tag.name)).toEqual(["vision"])
    const collections = library.prepare("SELECT name, kind FROM collection").all() as Array<{ name: string; kind: string }>
    expect(collections).toEqual([{ name: "Thesis References", kind: "manual" }])
    const members = library.prepare("SELECT COUNT(*) AS count FROM paper_collection").get() as { count: number }
    expect(members.count).toBe(2)
    library.close()
  })

  test("survives a crippled database missing optional tables", async () => {
    createZoteroFixture(zoteroDir, { crippled: true })
    const report = await importZotero(join(zoteroDir, "zotero.sqlite"), { projectRoot, db })
    expect(report.imported).toBe(2)
    expect(report.warnings.some((warning) => warning.includes("tags"))).toBe(true)
    expect(report.warnings.some((warning) => warning.includes("itemAttachments"))).toBe(true)
    expect(db.listPapers().length).toBe(2)
  })

  test("rejects a missing database file", async () => {
    await expect(importZotero(join(zoteroDir, "nope.sqlite"), { projectRoot, db })).rejects.toThrow(/not found/)
  })
})
