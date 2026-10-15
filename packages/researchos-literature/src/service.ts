import { createAcademicHub, semanticScholarCitationsAdapter, type ApiHub } from "@researchos/api-hub"
import { mkdirSync } from "fs"
import { join } from "path"
import { chunkPaperText } from "./chunk"
import { LiteratureDB } from "./db"
import { createEmbedder, type Embedder } from "./embed"
import { toBibtex, toEndnote, toMarkdown, toRis, toStyledMarkdown } from "./export"
import { computePaperId, importPdf, type ImportPdfInput, type ImportResult } from "./import"
import { literatureDir, modelsDir, textDir } from "./paths"
import { extractPdfText } from "./pdf/extract"
import { normalizeDoi } from "./pdf/metadata"
import { recommendSimilar, type RecommendOptions } from "./recommend"
import { search, type SearchOptions } from "./search"
import { importZotero, type ZoteroImportReport } from "./zotero"
import type {
  CitationDirection,
  CitationEntry,
  CitationStyle,
  ExportFormat,
  PaperMeta,
  ReadResult,
  ReadSection,
  SearchResult,
} from "./types"

// 测试可注入假 hub；真实 hub（HubImpl）自带 close 释放缓存连接
type ServiceHub = ApiHub & { close?: () => void }

export class LiteratureService {
  private constructor(
    readonly projectRoot: string,
    private db: LiteratureDB,
    private hub: ServiceHub,
    private embedder: Embedder | null,
  ) {}

  static async open(projectRoot: string, hub?: ServiceHub, embedder?: Embedder | null) {
    const db = new LiteratureDB(projectRoot)
    await db.init()
    return new LiteratureService(
      projectRoot,
      db,
      hub ?? createAcademicHub({
        projectRoot,
        credentials: {
          semantic_scholar: { key: "{env:S2_API_KEY}" },
          pubmed: { key: "{env:NCBI_API_KEY}" },
          crossref: { mailto: "{env:CROSSREF_MAILTO}" },
        },
      }),
      embedder === undefined ? createEmbedder(modelsDir(projectRoot)) : embedder,
    )
  }

  async search(query: string, options: Omit<SearchOptions, "hub"> = {}) {
    const results = await search(query, { ...options, hub: this.hub })
    this.db.insertPapers(results.map(searchResultToPaper))
    return results
  }

  async importPdf(input: ImportPdfInput): Promise<ImportResult> {
    const result = await importPdf(input, { projectRoot: this.projectRoot, hub: this.hub })
    this.db.insertPaper(result.paper)
    this.db.insertExternalPapers(result.references.externalPapers)
    this.db.insertCitationEdges(result.references.edges)
    // 嵌入写入失败（模型未下载/扩展缺失）不阻断导入
    if (result.paper.abstract && this.db.vecAvailable && this.embedder) {
      await this.embedder([result.paper.abstract])
        .then(([embedding]) => {
          if (embedding) this.db.upsertEmbedding(result.paper.id, embedding)
        })
        .catch(() => {})
    }
    // 全文分块/嵌入失败同样不阻断导入；read 时会惰性重建
    await this.indexFullText(result.paper.id).catch(() => {})
    return result
  }

  async read(paperId: string, query: string, k = 6): Promise<ReadResult> {
    const limit = Math.min(50, Math.max(1, Math.floor(k)))
    if (this.db.chunkCount(paperId) === 0) await this.backfillChunks(paperId).catch(() => {})
    const chunks = this.db.chunksForPaper(paperId)
    if (!chunks.length) {
      return { paperId, query, sections: [], degraded: true, reason: "no-fulltext" }
    }
    const semantic = await this.sectionVectorScores(paperId, query, limit)
    if (semantic?.length) return { paperId, query, sections: semantic, degraded: false }
    const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
    const sections = chunks
      .map((chunk) => ({ section: chunk.section, text: chunk.text, score: keywordScore(terms, chunk.text) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return { paperId, query, sections, degraded: true }
  }

  // 与 recommend 的降级策略一致：向量链路任何一步失败都退回关键词模式
  private async sectionVectorScores(paperId: string, query: string, k: number): Promise<ReadSection[] | null> {
    if (!this.db.vecAvailable || !this.embedder) return null
    try {
      const [embedding] = await this.embedder([query])
      if (!embedding) return null
      return this.db.knnChunks(embedding, k, paperId).map((hit) => ({
        section: hit.section,
        text: hit.text,
        score: 1 / (1 + hit.distance),
      }))
    } catch {
      return null
    }
  }

  private async indexFullText(paperId: string): Promise<void> {
    const file = Bun.file(join(textDir(this.projectRoot), `${paperId}.txt`))
    if (!(await file.exists())) return
    const chunks = chunkPaperText(await file.text())
    if (!chunks.length) return
    this.db.replaceChunks(paperId, chunks.map((chunk, seq) => ({ ...chunk, seq })))
    if (!this.db.vecAvailable || !this.embedder) return
    const embeddings = await this.embedder(chunks.map((chunk) => chunk.text))
    this.db.upsertChunkEmbeddings(chunks.flatMap((_, seq) => {
      const embedding = embeddings[seq]
      return embedding ? [{ chunkId: `${paperId}:${seq}`, embedding }] : []
    }))
  }

  // 惰性补偿：文本缺失时从归档 PDF 重新提取；两者都没有则维持 no-fulltext 降级
  private async backfillChunks(paperId: string): Promise<void> {
    const dir = textDir(this.projectRoot)
    const textPath = join(dir, `${paperId}.txt`)
    if (!(await Bun.file(textPath).exists())) {
      const paper = this.db.getPaper(paperId)
      const pdfPath = paper?.pdfPath ?? `pdfs/${String(paper?.year ?? "unknown")}/${paperId}.pdf`
      const pdf = Bun.file(join(literatureDir(this.projectRoot), pdfPath))
      if (!(await pdf.exists())) return
      const text = await extractPdfText(new Uint8Array(await pdf.arrayBuffer())).catch(() => null)
      if (!text) return
      mkdirSync(dir, { recursive: true })
      await Bun.write(textPath, text)
    }
    await this.indexFullText(paperId)
  }

  async getCitations(id: string, direction: CitationDirection): Promise<CitationEntry[]> {
    if (direction === "references") return this.db.getCitations(id, direction)
    await this.fetchCitedBy(id).catch(() => {})
    return this.db.getCitations(id, direction)
  }

  // S2 cited_by 在线补全：拉取的 citing 论文落 external_paper + citation_edge，后续走纯本地查询
  private async fetchCitedBy(id: string): Promise<void> {
    const paper = this.db.getPaper(id)
    if (!paper) return
    const s2Id = paper.doi ? `DOI:${paper.doi}` : paper.arxivId ? `ARXIV:${paper.arxivId}` : null
    if (!s2Id) return
    const result = await this.hub.call(semanticScholarCitationsAdapter, { paperId: s2Id, limit: 100 })
    const citing = result.data.map(({ citingPaper }) => {
      const doi = citingPaper.externalIds?.DOI ? normalizeDoi(citingPaper.externalIds.DOI) : null
      const arxivId = citingPaper.externalIds?.ArXiv ?? null
      return {
        id: computePaperId(doi, arxivId, citingPaper.title),
        title: citingPaper.title,
        year: citingPaper.year ?? null,
        doi,
      }
    })
    this.db.insertExternalPapers(citing)
    this.db.insertCitationEdges(citing.map((entry) => ({
      fromId: entry.id,
      toId: id,
      context: null,
      source: "semantic_scholar",
    })))
  }

  recommendSimilar(paperId: string, limit?: number) {
    const options: RecommendOptions = { db: this.db, embedder: this.embedder, limit }
    return recommendSimilar(paperId, options)
  }

  importZotero(path: string): Promise<ZoteroImportReport> {
    return importZotero(path, { projectRoot: this.projectRoot, db: this.db })
  }

  list(limit = 50, offset = 0) {
    return this.db.listPapers(limit, offset)
  }

  get(id: string) {
    return this.db.getPaper(id)
  }

  updatePaper(id: string, flags: { isRead?: boolean; isFavorite?: boolean }) {
    this.db.updatePaperFlags(id, flags)
    return this.db.getPaper(id)
  }

  async export(ids: string[], format: ExportFormat, style?: CitationStyle) {
    const papers = this.db.getPapers(ids)
    if (format === "json") return JSON.stringify(papers, null, 2)
    if (format === "markdown" && style) return toStyledMarkdown(papers, style)
    const serializers = {
      bibtex: toBibtex,
      ris: toRis,
      endnote: toEndnote,
      markdown: toMarkdown,
    }
    return papers.map(serializers[format]).join("\n\n")
  }

  close() {
    this.hub.close?.()
    this.db.close()
  }
}

// 词频重叠打分：查询词在 chunk 中的归一化命中数（recommend.ts 关键词降级的同款思路）
function keywordScore(terms: string[], text: string): number {
  if (!terms.length) return 0
  const words = new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
  return terms.filter((term) => words.has(term)).length / terms.length
}

function searchResultToPaper(result: SearchResult): PaperMeta {  const now = Date.now()
  return {
    ...result,
    source: result.source,
    keywords: [],
    pdfPath: null,
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: result.authors.map((author) => ({ ...author, affiliation: null })),
    createdAt: now,
    updatedAt: now,
  }
}
