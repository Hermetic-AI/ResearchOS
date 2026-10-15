import { z } from "zod"
import type { ApiAdapter } from "../registry"

const CrossrefItem = z.object({
  DOI: z.string().optional(),
  title: z.array(z.string()).default([]),
  author: z.array(z.object({ given: z.string().optional(), family: z.string().optional() })).default([]),
  issued: z.object({ "date-parts": z.array(z.array(z.number())).optional() }).optional(),
  abstract: z.string().optional(),
  "container-title": z.array(z.string()).default([]),
  publisher: z.string().optional(),
})

const CrossrefResponse = z.object({
  message: z.object({
    items: z.array(CrossrefItem).default([]),
    "total-results": z.number().optional(),
  }),
})

export interface CrossrefSearchReq {
  query: string
  rows?: number
}

export const crossrefAdapter: ApiAdapter<CrossrefSearchReq, z.infer<typeof CrossrefResponse>> = {
  descriptor: {
    name: "crossref",
    description: "Crossref REST API — DOI metadata, CSL/BibTeX",
    baseUrl: "https://api.crossref.org",
    auth: "mailto",
    rateLimit: { rps: 10 },
    cacheTtlS: 7200,
    enabled: true,
    testPath: "/works?rows=1",
  },
  buildRequest: (req, credential) => ({
    path: "/works",
    params: {
      query: req.query,
      rows: String(req.rows ?? 10),
      ...(credential.mailto ? { mailto: credential.mailto } : {}),
    },
  }),
  testRequest: (credential) => ({
    path: "/works",
    params: { rows: "1", ...(credential.mailto ? { mailto: credential.mailto } : {}) },
  }),
  schema: CrossrefResponse,
}
