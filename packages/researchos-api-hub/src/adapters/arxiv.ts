import { z } from "zod"
import type { ApiAdapter } from "../registry"

const ArxivEntry = z.object({
  id: z.string(),
  title: z.string().transform((t) => t.replace(/\s+/g, " ").trim()),
  summary: z.string().transform((s) => s.replace(/\s+/g, " ").trim()),
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
    baseUrl: "http://export.arxiv.org",
    auth: "none",
    rateLimit: { rps: 0.3 },
    cacheTtlS: 3600,
    enabled: true,
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
}
