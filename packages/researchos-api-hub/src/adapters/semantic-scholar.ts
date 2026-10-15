import { z } from "zod"
import type { ApiAdapter } from "../registry"

const S2Paper = z.object({
  paperId: z.string(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string() })).default([]),
  year: z.number().optional(),
  venue: z.string().optional(),
  externalIds: z.object({
    DOI: z.string().optional(),
    ArXiv: z.string().optional(),
  }).optional(),
  abstract: z.string().optional(),
  citationCount: z.number().optional(),
  referenceCount: z.number().optional(),
})

const S2SearchResponse = z.object({
  data: z.array(S2Paper),
  total: z.number().optional(),
  offset: z.number().optional(),
})

export interface S2SearchReq {
  query: string
  limit?: number
  offset?: number
}

export const semanticScholarAdapter: ApiAdapter<S2SearchReq, z.infer<typeof S2SearchResponse>> = {
  descriptor: {
    name: "semantic_scholar",
    description: "Semantic Scholar Graph API — paper search, citations, recommendations",
    baseUrl: "https://api.semanticscholar.org",
    auth: "api_key",
    rateLimit: { rps: 1, burst: 5 },
    cacheTtlS: 3600,
    enabled: true,
    testPath: "/graph/v1/paper/search?query=research&limit=1&fields=title",
  },
  buildRequest: (req) => ({
    path: "/graph/v1/paper/search",
    params: {
      query: req.query,
      limit: String(req.limit ?? 10),
      offset: String(req.offset ?? 0),
      fields: "title,authors,year,venue,externalIds,abstract,citationCount,referenceCount",
    },
  }),
  headers: (_, credential) => apiKeyHeaders(credential.key),
  testRequest: (credential) => ({
    path: "/graph/v1/paper/search",
    params: { query: "research", limit: "1", fields: "title" },
    headers: apiKeyHeaders(credential.key),
  }),
  schema: S2SearchResponse,
}

export interface S2CitationsReq {
  paperId: string
  limit?: number
  offset?: number
}

const S2CitationsResponse = z.object({
  data: z.array(z.object({ citingPaper: S2Paper })).default([]),
})

export const semanticScholarCitationsAdapter: ApiAdapter<S2CitationsReq, z.infer<typeof S2CitationsResponse>> = {
  descriptor: {
    name: "semantic_scholar_citations",
    description: "Semantic Scholar Graph API — papers citing a given paper",
    baseUrl: "https://api.semanticscholar.org",
    auth: "api_key",
    rateLimit: { rps: 1, burst: 5 },
    cacheTtlS: 3600,
    enabled: true,
    testPath: "/graph/v1/paper/DOI:10.1145/3442188.3445922/citations?limit=1&fields=title",
  },
  buildRequest: (req) => ({
    path: `/graph/v1/paper/${req.paperId}/citations`,
    params: {
      limit: String(req.limit ?? 100),
      offset: String(req.offset ?? 0),
      fields: "title,authors,year,venue,externalIds,abstract,citationCount,referenceCount",
    },
  }),
  headers: (_, credential) => apiKeyHeaders(credential.key),
  schema: S2CitationsResponse,
}

function apiKeyHeaders(key?: string): Record<string, string> {
  if (!key) return {}
  return { "x-api-key": key }
}
