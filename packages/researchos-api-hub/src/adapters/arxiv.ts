import { z } from "zod"
import type { ApiAdapter } from "../registry"

const ArxivEntry = z.object({
  id: z.string(),
  title: z.string().transform((value) => value.replace(/\s+/g, " ").trim()),
  summary: z.string().transform((value) => value.replace(/\s+/g, " ").trim()),
  author: z.array(z.object({ name: z.string() })).default([]),
  published: z.string(),
  link: z.array(z.object({ title: z.string().optional(), href: z.string() })),
})

const ArxivResponse = z.object({
  feed: z.object({
    entry: z.array(ArxivEntry).default([]),
  }),
})

export interface ArxivSearchReq {
  query: string
  maxResults?: number
  start?: number
}

export const arxivAdapter: ApiAdapter<ArxivSearchReq, z.infer<typeof ArxivResponse>> = {
  descriptor: {
    name: "arxiv",
    description: "arXiv API — physics, math, CS, and related fields",
    baseUrl: "https://export.arxiv.org",
    auth: "none",
    rateLimit: { rps: 0.3 },
    cacheTtlS: 604800,
    enabled: true,
    testPath: "/api/query?search_query=all:electron&start=0&max_results=1",
  },
  buildRequest: (req) => ({
    path: "/api/query",
    params: {
      search_query: req.query,
      max_results: String(req.maxResults ?? 10),
      start: String(req.start ?? 0),
      sortBy: "relevance",
      sortOrder: "descending",
    },
  }),
  schema: ArxivResponse,
  decode: async (response) => parseArxivXml(await response.text()),
}

export function parseArxivXml(xml: string): z.infer<typeof ArxivResponse> {
  return {
    feed: {
      entry: Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi), (match) => {
        const entry = match[1] ?? ""
        return {
          id: text(entry, "id"),
          title: text(entry, "title"),
          summary: text(entry, "summary"),
          published: text(entry, "published"),
          author: Array.from(entry.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi), (author) => ({
            name: text(author[1] ?? "", "name"),
          })),
          link: Array.from(entry.matchAll(/<link\b([^>]*)\/?\s*>/gi), (link) => ({
            href: attribute(link[1] ?? "", "href"),
            ...(attribute(link[1] ?? "", "title") ? { title: attribute(link[1] ?? "", "title") } : {}),
          })).filter((link) => link.href),
        }
      }),
    },
  }
}

function text(xml: string, tag: string) {
  const value = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml)?.[1] ?? ""
  return decodeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
}

function attribute(attributes: string, name: string) {
  return decodeXml(new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(attributes)?.[1] ?? "")
}

function decodeXml(value: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
  return value.replace(/&#(x?[0-9a-f]+);|&([a-z]+);/gi, (_, numeric: string | undefined, named: string | undefined) => {
    if (numeric) return String.fromCodePoint(Number.parseInt(numeric.replace(/^x/i, ""), /^x/i.test(numeric) ? 16 : 10))
    return entities[named?.toLowerCase() ?? ""] ?? `&${named};`
  })
}
