import { mkdirSync } from "fs"
import { dirname, join, resolve, sep } from "path"
import { crossrefAdapter, semanticScholarAdapter, type ApiHub } from "@researchos/api-hub"
import { extractPdfText } from "./pdf/extract"
import { fetchGrobidReferences } from "./pdf/grobid"
import { normalizeDoi, parsePdfMetadata, type PdfMetadata } from "./pdf/metadata"
import { parseReferences, type ParsedReference } from "./pdf/references"
import { pdfDir, textDir } from "./paths"
import type { CitationEdge, PaperMeta } from "./types"

export { parsePdfMetadata } from "./pdf/metadata"

export function computePaperId(doi: string | null, arxivId: string | null, title: string): string {
  const raw = (doi ?? arxivId ?? title.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")).toLowerCase()
  return new Bun.CryptoHasher("sha1").update(raw).digest("hex").slice(0, 8)
}

export async function importPaper(
  title: string,
  extras: Partial<Pick<PaperMeta, "doi" | "arxivId" | "year" | "venue" | "abstract" | "keywords" | "authors">>,
  source: PaperMeta["source"] = "manual",
): Promise<PaperMeta> {
  const now = Date.now()
  return {
    id: computePaperId(extras.doi ?? null, extras.arxivId ?? null, title),
    doi: extras.doi ?? null,
    arxivId: extras.arxivId ?? null,
    title,
    year: extras.year ?? null,
    venue: extras.venue ?? null,
    abstract: extras.abstract ?? null,
    keywords: extras.keywords ?? [],
    citationCount: 0,
    pdfPath: null,
    source,
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: extras.authors ?? [],
    createdAt: now,
    updatedAt: now,
  }
}

export interface ImportPdfInput {
  path?: string
  url?: string
}

export interface ImportPdfOptions {
  projectRoot: string
  hub?: ApiHub
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export interface ImportReferences {
  source: "grobid" | "pdf"
  externalPapers: Array<{ id: string; title: string | null; year: number | null; doi: string | null }>
  edges: CitationEdge[]
}

export interface ImportResult {
  paper: PaperMeta
  metadataSource: "crossref" | "semantic_scholar" | "pdf"
  references: ImportReferences
}

export async function importPdf(input: ImportPdfInput, options: ImportPdfOptions): Promise<ImportResult> {
  if (Boolean(input.path) === Boolean(input.url)) throw new Error("importPdf requires exactly one of path or url")
  const data = input.path
    ? await readLocalPdf(input.path, options.projectRoot)
    : await downloadPdf(String(input.url), options.fetch)

  // 标题候选只取首页（跨页最长行会误中正文长句）；DOI/arXiv/年份取前 3 页
  const extracted = parsePdfMetadata(await extractPdfText(data, 3))
  extracted.title = parsePdfMetadata(await extractPdfText(data, 1)).title
  // 全文只提取一次：既写盘供 read 分块，也复用给参考文献解析；失败不阻断导入
  const fullText = await extractPdfText(data).catch(() => null)
  const enrichment = await enrichMetadata(extracted, options.hub)
  const doi = enrichment?.doi ?? extracted.doi
  const arxivId = enrichment?.arxivId ?? extracted.arxivId
  const title = enrichment?.title || extracted.title || "Untitled"
  const year = enrichment?.year ?? extracted.year
  const id = computePaperId(doi, arxivId, title)
  const pdfPath = await archivePdf(data, id, year, input.path, options.projectRoot)
  if (fullText) await persistFullText(options.projectRoot, id, fullText)

  const now = Date.now()
  const paper: PaperMeta = {
    id,
    doi,
    arxivId,
    title,
    year,
    venue: enrichment?.venue ?? null,
    abstract: enrichment?.abstract ?? null,
    keywords: [],
    citationCount: 0,
    pdfPath,
    source: enrichment?.source ?? "manual",
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: enrichment?.authors ?? [],
    createdAt: now,
    updatedAt: now,
  }

  return {
    paper,
    metadataSource: enrichment?.source ?? "pdf",
    references: await resolveReferences(data, id, fullText),
  }
}

async function persistFullText(projectRoot: string, paperId: string, text: string): Promise<void> {
  // 写盘失败只损失 read 的全文检索能力，不影响导入主链路
  const dir = textDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  await Bun.write(join(dir, `${paperId}.txt`), text).catch(() => {})
}

async function readLocalPdf(path: string, projectRoot: string): Promise<Uint8Array> {
  // 安全白名单：解析后的路径必须仍在 projectRoot 内，阻断 "../" 越界读取
  const root = resolve(projectRoot)
  const resolved = resolve(root, path)
  if (!resolved.startsWith(root + sep)) throw new Error(`PDF path escapes project root: ${path}`)
  const file = Bun.file(resolved)
  if (!(await file.exists())) throw new Error(`PDF not found: ${resolved}`)
  return new Uint8Array(await file.arrayBuffer())
}

async function downloadPdf(
  url: string,
  fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported PDF URL protocol: ${parsed.protocol}`)
  }
  const response = await (fetcher ?? fetch)(parsed)
  if (!response.ok) throw new Error(`Failed to download PDF: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function archivePdf(
  data: Uint8Array,
  paperId: string,
  year: number | null,
  sourcePath: string | undefined,
  projectRoot: string,
): Promise<string> {
  const yearDir = String(year ?? "unknown")
  const target = join(pdfDir(projectRoot), yearDir, `${paperId}.pdf`)
  const alreadyArchived = sourcePath ? resolve(projectRoot, sourcePath) === target : false
  if (!alreadyArchived) {
    mkdirSync(dirname(target), { recursive: true })
    await Bun.write(target, data)
  }
  return `pdfs/${yearDir}/${paperId}.pdf`
}

interface Enrichment {
  source: "crossref" | "semantic_scholar"
  doi: string | null
  arxivId: string | null
  title: string
  year: number | null
  venue: string | null
  abstract: string | null
  authors: Array<{ name: string; affiliation: null }>
}

async function enrichMetadata(extracted: PdfMetadata, hub?: ApiHub): Promise<Enrichment | null> {
  if (!hub) return null
  if (extracted.doi) {
    const hit = await findCrossref(hub, extracted.doi)
    if (hit) return hit
  }
  if (extracted.title) return findSemanticScholar(hub, extracted.title)
  return null
}

async function findCrossref(hub: ApiHub, doi: string): Promise<Enrichment | null> {
  // 网络/限流失败不阻断导入，降级为 PDF 提取的元数据
  const result = await hub.call(crossrefAdapter, { query: doi, rows: 5 }).catch(() => null)
  const item = result?.message.items.find(
    (candidate) => candidate.DOI && normalizeDoi(candidate.DOI) === normalizeDoi(doi),
  )
  if (!item) return null
  return {
    source: "crossref",
    doi: normalizeDoi(item.DOI ?? doi),
    arxivId: null,
    title: item.title[0] ?? "",
    year: item.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: item["container-title"][0] ?? null,
    abstract: item.abstract?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
    authors: item.author.map((author) => ({
      name: [author.given, author.family].filter(Boolean).join(" "),
      affiliation: null,
    })),
  }
}

async function findSemanticScholar(hub: ApiHub, title: string): Promise<Enrichment | null> {
  const result = await hub.call(semanticScholarAdapter, { query: title, limit: 5 }).catch(() => null)
  const item = result?.data[0]
  if (!item) return null
  return {
    source: "semantic_scholar",
    doi: item.externalIds?.DOI ? normalizeDoi(item.externalIds.DOI) : null,
    arxivId: item.externalIds?.ArXiv ?? null,
    title: item.title,
    year: item.year ?? null,
    venue: item.venue || null,
    abstract: item.abstract ?? null,
    authors: item.authors.map((author) => ({ name: author.name, affiliation: null })),
  }
}

async function resolveReferences(data: Uint8Array, paperId: string, fullText: string | null): Promise<ImportReferences> {
  const grobidUrl = process.env.RESEARCHOS_GROBID_URL
  // GROBID 不可用时降级回规则解析，不阻断导入
  const grobidRefs = grobidUrl ? await fetchGrobidReferences(data, grobidUrl).catch(() => null) : null
  // fullText 为 null 说明全文提取失败过，退回现场再试一次以保持原有行为
  const text = fullText ?? (await extractPdfText(data).catch(() => ""))
  const refs = grobidRefs?.length ? grobidRefs : parseReferences(text)
  const source = grobidRefs?.length ? "grobid" as const : "pdf" as const

  const targets = new Map(
    refs.flatMap((ref) => {
      const doi = ref.doi ? normalizeDoi(ref.doi) : null
      const title = ref.title?.trim() || null
      if (!doi && !ref.arxivId && !title) return []
      const id = computePaperId(doi, ref.arxivId ?? null, title ?? ref.raw.slice(0, 80))
      return [[id, { id, title, year: ref.year ?? null, doi }] as const]
    }),
  )
  targets.delete(paperId)
  return {
    source,
    externalPapers: Array.from(targets.values()),
    edges: Array.from(targets.keys(), (toId) => ({ fromId: paperId, toId, context: null, source })),
  }
}
