import { HubImpl, arxivAdapter, semanticScholarAdapter, crossrefAdapter, pubmedAdapter } from "@researchos/api-hub"
import type { SearchResult } from "./types"

const hub = new HubImpl()
hub.register(arxivAdapter)
hub.register(semanticScholarAdapter)
hub.register(crossrefAdapter)
hub.register(pubmedAdapter)

interface SearchOptions {
  sources?: string[]
  limit?: number
  start?: number
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const sources = options.sources ?? ["arxiv", "semantic_scholar", "crossref", "pubmed"]
  const limit = options.limit ?? 20

  const promises: Promise<SearchResult[]>[] = []

  if (sources.includes("arxiv")) {
    promises.push(
      hub.call(arxivAdapter, { query, maxResults: limit / 2, start: options.start ?? 0 })
        .then((res) => res.feed.entry.map(mapArxivEntry))
        .catch(() => [] as SearchResult[]),
    )
  }

  if (sources.includes("semantic_scholar")) {
    promises.push(
      hub.call(semanticScholarAdapter, { query, limit: limit / 2, offset: options.start ?? 0 })
        .then((res) => res.data.map(mapS2Entry))
        .catch(() => [] as SearchResult[]),
    )
  }

  if (sources.includes("crossref")) {
    promises.push(
      hub.call(crossrefAdapter, { query, rows: limit / 2 })
        .then((res) => res.message.items.map(mapCrossrefEntry))
        .catch(() => [] as SearchResult[]),
    )
  }

  if (sources.includes("pubmed")) {
    promises.push(
      hub.call(pubmedAdapter, { query, maxResults: limit / 2 })
        .then((res) => res.esearchresult.idlist.map((id) => stubResult(id, "pubmed")))
        .catch(() => [] as SearchResult[]),
    )
  }

  const results = await Promise.all(promises)
  const merged = results.flat()
  return dedup(merged).slice(0, limit)
}

function dedup(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    const key = r.doi ?? r.arxivId ?? r.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stubMedResult(id: string): SearchResult {
  return {
    id: `pubmed:${id}`,
    doi: null,
    arxivId: null,
    title: `PubMed ID: ${id}`,
    year: null,
    venue: null,
    authors: [],
    abstract: null,
    citationCount: 0,
    source: "pubmed",
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
  const doiLink = entry.link.find((l: { title?: string; href: string }) => l.title === "doi")
  return {
    id: entry.id.replace("http://arxiv.org/abs/", ""),
    doi: doiLink?.href ?? null,
    arxivId: entry.id.replace("http://arxiv.org/abs/", ""),
    title: entry.title,
    year: new Date(entry.published).getFullYear(),
    venue: null,
    authors: entry.author.map((a: { name: string }) => ({ name: a.name })),
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
  return {
    id: entry.paperId,
    doi: entry.externalIds?.DOI ?? null,
    arxivId: entry.externalIds?.ArXiv ?? null,
    title: entry.title,
    year: entry.year ?? null,
    venue: entry.venue ?? null,
    authors: entry.authors.map((a: { name: string }) => ({ name: a.name })),
    abstract: entry.abstract ?? null,
    citationCount: entry.citationCount ?? 0,
    source: "semantic_scholar",
  }
}

function mapCrossrefEntry(entry: {
  DOI?: string
  title: string[]
  author: Array<{ given?: string; family?: string }>
  issued?: { "date-parts": number[][] }
  abstract?: string
  "container-title": string[]
}): SearchResult {
  return {
    id: entry.DOI ?? crypto.randomUUID(),
    doi: entry.DOI ?? null,
    arxivId: null,
    title: entry.title[0] ?? "",
    year: entry.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: entry["container-title"][0] ?? null,
    authors: entry.author.map((a: { given?: string; family?: string }) => ({
      name: [a.given, a.family].filter(Boolean).join(" "),
    })),
    abstract: entry.abstract ?? null,
    citationCount: 0,
    source: "crossref",
  }
}
