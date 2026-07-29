import {
  arxivAdapter,
  createAcademicHub,
  crossrefAdapter,
  pubmedAdapter,
  pubmedSummaryAdapter,
  semanticScholarAdapter,
  type ApiHub,
} from "@researchos/api-hub"
import { computePaperId } from "./import"
import type { SearchResult } from "./types"

export type LiteratureSource = "arxiv" | "semantic_scholar" | "crossref" | "pubmed"

export interface SearchOptions {
  sources?: LiteratureSource[]
  limit?: number
  start?: number
  hub?: ApiHub
}

const defaultHub = createAcademicHub({
  credentials: {
    semantic_scholar: { key: "{env:S2_API_KEY}" },
    pubmed: { key: "{env:NCBI_API_KEY}" },
    crossref: { mailto: "{env:CROSSREF_MAILTO}" },
  },
})

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const sources = options.sources ?? ["arxiv", "semantic_scholar", "crossref", "pubmed"]
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)))
  const start = Math.max(0, Math.floor(options.start ?? 0))
  const hub = options.hub ?? defaultHub
  const searches = sources.map((source) => searchSource(source, query, limit, start, hub).catch(() => []))
  return deduplicate(await Promise.all(searches).then((results) => results.flat())).slice(0, limit)
}

async function searchSource(source: LiteratureSource, query: string, limit: number, start: number, hub: ApiHub) {
  if (source === "arxiv") {
    return hub.call(arxivAdapter, { query, maxResults: limit, start }).then((result) => result.feed.entry.map(mapArxivEntry))
  }
  if (source === "semantic_scholar") {
    return hub.call(semanticScholarAdapter, { query, limit, offset: start }).then((result) => result.data.map(mapS2Entry))
  }
  if (source === "crossref") {
    return hub.call(crossrefAdapter, { query, rows: limit }).then((result) => result.message.items.map(mapCrossrefEntry))
  }
  const ids = await hub.call(pubmedAdapter, { query, maxResults: limit }).then((result) => result.esearchresult.idlist)
  if (ids.length === 0) return []
  return hub.call(pubmedSummaryAdapter, { ids }).then((result) => result.articles.map(mapPubmedEntry))
}

export function deduplicate(results: SearchResult[]): SearchResult[] {
  const merged = new Map<string, SearchResult>()
  results.forEach((result) => {
    const key = dedupKey(result)
    const current = merged.get(key)
    merged.set(key, current ? mergeResult(current, result) : result)
  })
  return Array.from(merged.values())
}

function dedupKey(result: SearchResult) {
  if (result.doi) return `doi:${normalizeDoi(result.doi)}`
  if (result.arxivId) return `arxiv:${result.arxivId.toLowerCase().replace(/v\d+$/, "")}`
  return `title:${normalizeTitle(result.title)}`
}

function mergeResult(first: SearchResult, second: SearchResult): SearchResult {
  return {
    id: computePaperId(first.doi ?? second.doi ?? null, first.arxivId ?? second.arxivId ?? null, first.title),
    doi: first.doi ?? second.doi,
    arxivId: first.arxivId ?? second.arxivId,
    title: first.title.length >= second.title.length ? first.title : second.title,
    year: first.year ?? second.year,
    venue: first.venue ?? second.venue,
    authors: first.authors.length >= second.authors.length ? first.authors : second.authors,
    abstract: first.abstract && first.abstract.length >= (second.abstract?.length ?? 0) ? first.abstract : second.abstract,
    citationCount: Math.max(first.citationCount, second.citationCount),
    source: first.source,
  }
}

function mapArxivEntry(entry: {
  id: string
  title: string
  summary: string
  author: Array<{ name: string }>
  published: string
  link: Array<{ title?: string; href: string }>
}): SearchResult {
  const arxivId = entry.id.replace(/^https?:\/\/arxiv\.org\/abs\//, "")
  const doi = entry.link.find((link) => link.title === "doi")?.href
  return {
    id: computePaperId(doi ? normalizeDoi(doi) : null, arxivId, entry.title),
    doi: doi ? normalizeDoi(doi) : null,
    arxivId,
    title: entry.title,
    year: year(entry.published),
    venue: null,
    authors: entry.author,
    abstract: entry.summary,
    citationCount: 0,
    source: "arxiv",
  }
}

function mapS2Entry(entry: {
  paperId: string
  title: string
  authors: Array<{ name: string }>
  year?: number
  venue?: string
  externalIds?: { DOI?: string; ArXiv?: string }
  abstract?: string
  citationCount?: number
}): SearchResult {
  const doi = entry.externalIds?.DOI ? normalizeDoi(entry.externalIds.DOI) : null
  const arxivId = entry.externalIds?.ArXiv ?? null
  return {
    id: computePaperId(doi, arxivId, entry.title),
    doi,
    arxivId,
    title: entry.title,
    year: entry.year ?? null,
    venue: entry.venue || null,
    authors: entry.authors,
    abstract: entry.abstract ?? null,
    citationCount: entry.citationCount ?? 0,
    source: "semantic_scholar",
  }
}

function mapCrossrefEntry(entry: {
  DOI?: string
  title: string[]
  author: Array<{ given?: string; family?: string }>
  issued?: { "date-parts"?: number[][] }
  abstract?: string
  "container-title": string[]
}): SearchResult {
  const title = entry.title[0] ?? ""
  const doi = entry.DOI ? normalizeDoi(entry.DOI) : null
  return {
    id: computePaperId(doi, null, title),
    doi,
    arxivId: null,
    title,
    year: entry.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: entry["container-title"][0] ?? null,
    authors: entry.author.map((author) => ({ name: [author.given, author.family].filter(Boolean).join(" ") })),
    abstract: entry.abstract?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
    citationCount: 0,
    source: "crossref",
  }
}

function mapPubmedEntry(entry: {
  uid: string
  title: string
  authors: Array<{ name: string }>
  pubdate?: string
  source?: string
  doi?: string
  abstract?: string
}): SearchResult {
  const doi = entry.doi ? normalizeDoi(entry.doi) : null
  return {
    id: computePaperId(doi, null, entry.title),
    doi,
    arxivId: null,
    title: entry.title,
    year: year(entry.pubdate),
    venue: entry.source ?? null,
    authors: entry.authors,
    abstract: entry.abstract ?? null,
    citationCount: 0,
    source: "pubmed",
  }
}

function normalizeDoi(value: string) {
  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase()
}

function normalizeTitle(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function year(value?: string) {
  const match = /\b(?:19|20)\d{2}\b/.exec(value ?? "")
  return match ? Number(match[0]) : null
}
