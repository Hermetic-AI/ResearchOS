import { z } from "zod"
import type { ApiAdapter } from "../registry"

const PubMedArticle = z.object({
  uid: z.string(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string() })).default([]),
  pubdate: z.string().optional(),
  source: z.string().optional(),
  doi: z.string().optional(),
  abstract: z.string().optional(),
})

const PubMedSearchResult = z.object({
  esearchresult: z.object({
    idlist: z.array(z.string()).default([]),
    count: z.string().optional(),
  }),
})

const PubMedSummaryResult = z.object({
  result: z.object({
    uids: z.array(z.string()).default([]),
  }).passthrough(),
})

export interface PubMedSearchReq {
  query: string
  maxResults?: number
}

export const pubmedAdapter: ApiAdapter<PubMedSearchReq, z.infer<typeof PubMedSearchResult>> = {
  descriptor: {
    name: "pubmed",
    description: "NCBI E-utilities / PubMed — biomedical literature",
    baseUrl: "https://eutils.ncbi.nlm.nih.gov",
    auth: "api_key",
    rateLimit: { rps: 3, burst: 3 },
    cacheTtlS: 3600,
    enabled: true,
  },
  buildRequest: (req) => ({
    path: "/entrez/eutils/esearch.fcgi",
    params: {
      db: "pubmed",
      term: req.query,
      retmax: String(req.maxResults ?? 10),
      retmode: "json",
    },
  }),
  schema: PubMedSearchResult,
}
