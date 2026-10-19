import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { LiteratureDB } from "./db"
import { computePaperId } from "./import"
import { findArxivId, normalizeDoi } from "./pdf/metadata"
import { pdfDir } from "./paths"

export interface ZoteroImportReport {
  imported: number
  skipped: number
  pdfsCopied: number
  warnings: string[]
}

// 只导入文献型条目；attachment/note/annotation 等在 itemTypes 层排除
const INCLUDED_TYPES = new Set([
  "journalArticle", "conferencePaper", "preprint", "book", "bookSection",
  "thesis", "report", "manuscript", "magazineArticle", "newspaperArticle",
])

export async function importZotero(
  zoteroSqlitePath: string,
  options: { projectRoot: string; db: LiteratureDB },
): Promise<ZoteroImportReport> {
  const source = Bun.file(zoteroSqlitePath)
  if (!(await source.exists())) throw new Error(`Zotero database not found: ${zoteroSqlitePath}`)
  // 复制到临时文件再只读打开，避免与运行中的 Zotero 锁冲突
  const tmp = join(await mkdtemp(join(tmpdir(), "researchos-zotero-")), "zotero.sqlite")
  await Bun.write(tmp, await source.arrayBuffer())
  const zotero = new Database(tmp, { readonly: true })
  try {
    return importFromDatabase(zotero, dirname(zoteroSqlitePath), options)
  } finally {
    zotero.close()
    await rm(dirname(tmp), { recursive: true, force: true }).catch(() => {})
  }
}

function importFromDatabase(
  zotero: Database,
  zoteroDir: string,
  options: { projectRoot: string; db: LiteratureDB },
): ZoteroImportReport {
  const warnings: string[] = []
  const tables = new Set(
    (zotero.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
      .map((row) => row.name),
  )
  const required = ["items", "itemTypes", "fields", "itemData", "itemDataValues", "creators", "itemCreators"]
  const missing = required.filter((table) => !tables.has(table))
  if (missing.length > 0) throw new Error(`Not a usable Zotero database, missing tables: ${missing.join(", ")}`)
  ;["tags", "itemTags", "collections", "collectionItems", "itemAttachments", "creatorTypes"]
    .filter((table) => !tables.has(table))
    .forEach((table) => warnings.push(`table ${table} is missing; related data skipped`))

  const typeIds = new Set(
    (zotero.prepare("SELECT itemTypeID AS id, typeName AS name FROM itemTypes").all() as Array<{ id: number; name: string }>)
      .filter((row) => INCLUDED_TYPES.has(row.name))
      .map((row) => row.id),
  )
  const items = (zotero.prepare("SELECT itemID AS id, key, itemTypeID AS typeId FROM items").all() as Array<{ id: number; key: string; typeId: number }>)
    .filter((item) => typeIds.has(item.typeId))

  const fieldsByItem = groupBy(
    zotero.prepare(`
      SELECT d.itemID AS itemId, f.fieldName AS name, v.value AS value
      FROM itemData d
      JOIN fields f ON f.fieldID = d.fieldID
      JOIN itemDataValues v ON v.valueID = d.valueID
    `).all() as Array<{ itemId: number; name: string; value: string }>,
    (row) => row.itemId,
  )
  const creatorsByItem = groupBy(creatorRows(zotero, tables), (row) => row.itemId)
  const tagsByItem = tables.has("tags") && tables.has("itemTags")
    ? groupBy(
      zotero.prepare("SELECT t.itemID AS itemId, g.name AS name FROM itemTags t JOIN tags g ON g.tagID = t.tagID").all() as Array<{ itemId: number; name: string }>,
      (row) => row.itemId,
    )
    : new Map<number, Array<{ itemId: number; name: string }>>()
  const collections = tables.has("collections") && tables.has("collectionItems")
    ? zotero.prepare(`
        SELECT ci.itemID AS itemId, c.collectionName AS name
        FROM collectionItems ci JOIN collections c ON c.collectionID = ci.collectionID
      `).all() as Array<{ itemId: number; name: string }>
    : []
  const collectionsByItem = groupBy(collections, (row) => row.itemId)
  const attachments = tables.has("itemAttachments")
    ? attachmentRows(zotero)
    : new Map<number, Array<{ itemId: number; linkMode: number; path: string; key: string }>>()

  const seen = new Set<string>()
  let imported = 0
  let skipped = 0
  let pdfsCopied = 0
  items.forEach((item) => {
    const fields = new Map((fieldsByItem.get(item.id) ?? []).map((row) => [row.name, row.value] as const))
    const title = fields.get("title")?.trim()
    if (!title) {
      skipped += 1
      warnings.push(`item ${item.key} has no title; skipped`)
      return
    }
    const rawDoi = fields.get("DOI")
    const doi = rawDoi ? normalizeDoi(rawDoi) : null
    const arxivId = findArxivId(fields.get("extra") ?? "") ?? null
    const id = computePaperId(doi, arxivId, title)
    if (seen.has(id)) {
      skipped += 1
      return
    }
    seen.add(id)

    const year = extractYear(fields.get("date"))
    const pdfPath = archiveAttachments(attachments.get(item.id) ?? [], zoteroDir, id, year, options.projectRoot, warnings)
    pdfsCopied += pdfPath.copied

    const now = Date.now()
    options.db.insertPaper({
      id,
      doi,
      arxivId,
      title,
      year,
      venue: fields.get("publicationTitle") ?? fields.get("proceedingsTitle") ?? fields.get("bookTitle")
        ?? fields.get("university") ?? fields.get("publisher") ?? null,
      abstract: fields.get("abstractNote") ?? null,
      keywords: [],
      citationCount: 0,
      pdfPath: pdfPath.relative,
      source: "zotero",
      isRead: false,
      isFavorite: false,
      notesMd: null,
      authors: (creatorsByItem.get(item.id) ?? []).map((creator) => ({
        name: creator.mode === 1 ? creator.last : [creator.first, creator.last].filter(Boolean).join(" "),
        affiliation: null,
      })).filter((author) => author.name.length > 0),
      createdAt: now,
      updatedAt: now,
    })
    options.db.insertTags(id, (tagsByItem.get(item.id) ?? []).map((tag) => tag.name))
    ;(collectionsByItem.get(item.id) ?? []).forEach((collection) => {
      options.db.addPaperToCollection(id, options.db.insertCollection(collection.name, "manual"))
    })
    imported += 1
  })
  return { imported, skipped, pdfsCopied, warnings }
}

function creatorRows(zotero: Database, tables: Set<string>) {
  const authorFilter = tables.has("creatorTypes")
    ? (zotero.prepare("SELECT creatorTypeID AS id FROM creatorTypes WHERE creatorType = 'author'").get() as { id: number } | undefined)?.id
    : undefined
  const rows = zotero.prepare(`
    SELECT ic.itemID AS itemId, c.firstName AS first, c.lastName AS last, c.fieldMode AS mode
    FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID
    ${authorFilter === undefined ? "" : "WHERE ic.creatorTypeID = ?"}
    ORDER BY ic.itemID, ic.orderIndex
  `)
  return (authorFilter === undefined ? rows.all() : rows.all(authorFilter)) as Array<{
    itemId: number
    first: string
    last: string
    mode: number
  }>
}

function attachmentRows(zotero: Database) {
  const rows = zotero.prepare(`
    SELECT a.parentItemID AS itemId, a.linkMode AS linkMode, a.path AS path, i.key AS key
    FROM itemAttachments a JOIN items i ON i.itemID = a.itemID
    WHERE a.parentItemID IS NOT NULL AND a.contentType = 'application/pdf' AND a.path IS NOT NULL AND a.path != ''
  `).all() as Array<{ itemId: number; linkMode: number; path: string; key: string }>
  return groupBy(rows, (row) => row.itemId)
}

function archiveAttachments(
  attachments: Array<{ linkMode: number; path: string; key: string }>,
  zoteroDir: string,
  paperId: string,
  year: number | null,
  projectRoot: string,
  warnings: string[],
): { relative: string | null; copied: number } {
  const found = attachments
    .map((attachment) => resolveAttachmentPath(zoteroDir, attachment))
    .filter((path): path is string => path !== null)
    .find((path) => existsSync(path))
  if (!found) {
    attachments.forEach((attachment) => warnings.push(`attachment file not found: ${attachment.path}`))
    return { relative: null, copied: 0 }
  }
  const yearDir = String(year ?? "unknown")
  const target = join(pdfDir(projectRoot), yearDir, `${paperId}.pdf`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(found))
  return { relative: `pdfs/${yearDir}/${paperId}.pdf`, copied: 1 }
}

function resolveAttachmentPath(
  zoteroDir: string,
  attachment: { linkMode: number; path: string; key: string },
): string | null {
  if (attachment.path.startsWith("storage:")) {
    return join(zoteroDir, "storage", attachment.key, attachment.path.slice("storage:".length))
  }
  // linkMode 2 为 linked_file，path 列即绝对路径；其余按 storage 目录兜底
  if (attachment.linkMode === 2) return attachment.path
  return join(zoteroDir, "storage", attachment.key, attachment.path)
}

function extractYear(date: string | undefined): number | null {
  const match = /\b(?:19|20)\d{2}\b/.exec(date ?? "")
  return match ? Number(match[0]) : null
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>()
  rows.forEach((row) => {
    const bucket = grouped.get(key(row)) ?? []
    bucket.push(row)
    grouped.set(key(row), bucket)
  })
  return grouped
}
