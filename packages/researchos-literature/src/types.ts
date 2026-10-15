import { z } from "zod"

export const PaperMeta = z.object({
  id: z.string(),
  doi: z.string().nullish(),
  arxivId: z.string().nullish(),
  title: z.string(),
  year: z.number().nullish(),
  venue: z.string().nullish(),
  abstract: z.string().nullish(),
  keywords: z.array(z.string()).default([]),
  citationCount: z.number().default(0),
  pdfPath: z.string().nullish(),
  source: z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed", "zotero", "manual"]),
  isRead: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  notesMd: z.string().nullish(),
  authors: z.array(z.object({
    name: z.string(),
    affiliation: z.string().nullish(),
  })).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type PaperMeta = z.infer<typeof PaperMeta>

export const PaperCard = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number().nullish(),
  venue: z.string().nullish(),
  authors: z.array(z.object({ name: z.string() })).default([]),
  citationCount: z.number().default(0),
  isRead: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  source: z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed", "zotero", "manual"]),
})

export type PaperCard = z.infer<typeof PaperCard>

export const SearchResult = z.object({
  id: z.string(),
  doi: z.string().nullish(),
  arxivId: z.string().nullish(),
  title: z.string(),
  year: z.number().nullish(),
  venue: z.string().nullish(),
  authors: z.array(z.object({ name: z.string() })).default([]),
  abstract: z.string().nullish(),
  citationCount: z.number().default(0),
  source: z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed", "zotero", "manual"]),
})

export type SearchResult = z.infer<typeof SearchResult>

export const CitationEdge = z.object({
  fromId: z.string(),
  toId: z.string(),
  context: z.string().nullish(),
  source: z.enum(["pdf", "grobid", "semantic_scholar"]),
})

export type CitationEdge = z.infer<typeof CitationEdge>

export const CitationDirection = z.enum(["references", "cited_by"])
export type CitationDirection = z.infer<typeof CitationDirection>

export const CitationEntry = z.object({
  id: z.string(),
  title: z.string().nullish(),
  year: z.number().nullish(),
  doi: z.string().nullish(),
  source: z.enum(["pdf", "grobid", "semantic_scholar"]),
  inLibrary: z.boolean(),
})

export type CitationEntry = z.infer<typeof CitationEntry>

export const ScoredPaper = PaperCard.extend({ score: z.number() })
export type ScoredPaper = z.infer<typeof ScoredPaper>

export const RecommendResult = z.object({
  results: z.array(ScoredPaper),
  degraded: z.boolean(),
})
export type RecommendResult = z.infer<typeof RecommendResult>

export const ReadSection = z.object({
  section: z.string().nullable(),
  text: z.string(),
  score: z.number(),
})
export type ReadSection = z.infer<typeof ReadSection>

export const ReadResult = z.object({
  paperId: z.string(),
  query: z.string(),
  sections: z.array(ReadSection),
  degraded: z.boolean(),
  reason: z.string().optional(),
})
export type ReadResult = z.infer<typeof ReadResult>

export const ExportFormat = z.enum(["bibtex", "ris", "endnote", "json", "markdown"])
export type ExportFormat = z.infer<typeof ExportFormat>

export const CitationStyle = z.enum(["ieee", "acm", "apa", "nature", "springer"])
export type CitationStyle = z.infer<typeof CitationStyle>
