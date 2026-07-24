import type { PaperMeta } from "./types"

export function computePaperId(doi: string | null, arxivId: string | null, title: string): string {
  const raw = doi ?? arxivId ?? title.toLowerCase().replace(/\s+/g, "")
  return simpleHash(raw).substring(0, 8)
}

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  const hex = Math.abs(h).toString(16)
  return hex.padStart(8, "0").substring(0, 8)
}

export function parsePdfMetadata(text: string): {
  doi: string | null
  title: string | null
  year: number | null
} {
  const doiMatch = text.match(/\b10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/i)
  const doi = doiMatch ? doiMatch[0] : null

  const lines = text.split("\n").filter((l) => l.trim())
  const title = lines[0]?.trim().substring(0, 200) ?? null

  const yearMatch = text.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null

  return { doi, title, year }
}

export async function importPaper(
  title: string,
  extras: Partial<Pick<PaperMeta, "doi" | "arxivId" | "year" | "venue" | "abstract" | "keywords" | "authors">>,
  source: PaperMeta["source"] = "manual",
): Promise<PaperMeta> {
  const now = Date.now()
  return {
    id: computePaperId(extras.doi ?? null, extras.arxivId ?? null, title),
    doi: extras.doi ?? null,
    arxivId: extras.arxivId ?? null,
    title,
    year: extras.year ?? null,
    venue: extras.venue ?? null,
    abstract: extras.abstract ?? null,
    keywords: extras.keywords ?? [],
    citationCount: 0,
    pdfPath: null,
    source,
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: extras.authors ?? [],
    createdAt: now,
    updatedAt: now,
  }
}
