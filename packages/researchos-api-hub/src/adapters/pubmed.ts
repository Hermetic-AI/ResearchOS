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

const RawPubMedArticle = z.object({
  uid: z.string(),
  title: z.string(),
  authors: z.array(z.object({ name: z.string() })).default([]),
  pubdate: z.string().optional(),
  source: z.string().optional(),
  articleids: z.array(z.object({ idtype: z.string(), value: z.string() })).default([]),
})

const PubMedSearchResult = z.object({
  esearchresult: z.object({
    idlist: z.array(z.string()).default([]),
    count: z.string().optional(),
  }),
})

const PubMedSummaryResult = z.object({
  articles: z.array(PubMedArticle),
})

export interface PubMedSearchReq {
  query: string
  maxResults?: number
}

export interface PubMedSummaryReq {
  ids: string[]
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
    testPath: "/entrez/eutils/esearch.fcgi?db=pubmed&term=research&retmax=1&retmode=json",
  },
  buildRequest: (req, credential) => ({
    path: "/entrez/eutils/esearch.fcgi",
    params: {
      db: "pubmed",
      term: req.query,
      retmax: String(req.maxResults ?? 10),
      retmode: "json",
      ...(credential.key ? { api_key: credential.key } : {}),
    },
  }),
  testRequest: (credential) => ({
    path: "/entrez/eutils/esearch.fcgi",
    params: { db: "pubmed", term: "research", retmax: "1", retmode: "json", ...(credential.key ? { api_key: credential.key } : {}) },
  }),
  schema: PubMedSearchResult,
}

export const pubmedSummaryAdapter: ApiAdapter<PubMedSummaryReq, z.infer<typeof PubMedSummaryResult>> = {
  descriptor: {
    ...pubmedAdapter.descriptor,
    cacheTtlS: 604800,
  },
  buildRequest: (req, credential) => ({
    path: "/entrez/eutils/esummary.fcgi",
    params: {
      db: "pubmed",
      id: req.ids.join(","),
      retmode: "json",
      ...(credential.key ? { api_key: credential.key } : {}),
    },
  }),
  decode: async (response) => {
    const payload = await response.json()
    const result = z.object({
      result: z.looseObject({ uids: z.array(z.string()).default([]) }),
    }).parse(payload).result
    return {
      articles: result.uids.flatMap((uid) => {
        const value = RawPubMedArticle.safeParse(result[uid])
        if (!value.success) return []
        return [{
          uid: value.data.uid,
          title: value.data.title,
          authors: value.data.authors,
          pubdate: value.data.pubdate,
          source: value.data.source,
          doi: value.data.articleids.find((id) => id.idtype === "doi")?.value,
        }]
      }),
    }
  },
  schema: PubMedSummaryResult,
}
