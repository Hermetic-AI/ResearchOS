import { findArxivId, findDoi } from "./metadata"

export interface ParsedReference {
  raw: string
  doi?: string
  arxivId?: string
  title?: string
  year?: number
}

export function parseReferences(fullText: string): ParsedReference[] {
  const section = extractReferenceSection(fullText)
  if (!section) return []
  return splitEntries(section).map(parseEntry)
}

function extractReferenceSection(text: string): string | null {
  const lines = text.split("\n")
  // 取最后一次出现的段标题，避开目录页里的 "References" 条目
  const headings = lines.flatMap((line, i) =>
    /^\s*(?:\d+\.?\s*)?(references|bibliography)\s*$/i.test(line) ? [i] : [],
  )
  const start = headings.at(-1)
  if (start === undefined) return null
  const body = lines.slice(start + 1)
  const cut = body.findIndex((line) => /^\s*(appendix|supplementary material)\b/i.test(line))
  return (cut === -1 ? body : body.slice(0, cut)).join("\n").trim() || null
}

function splitEntries(section: string): string[] {
  const chunks = splitOnMarker(section)
  if (chunks) return chunks
  // 作者-年份等无编号格式：保守地按空行切
  return section.split(/\n\s*\n/).map(normalizeWhitespace).filter(Boolean)
}

function splitOnMarker(section: string): string[] | null {
  const bracketCount = section.match(/^\s*\[\d+\]/gm)?.length ?? 0
  if (bracketCount >= 2) return section.split(/^\s*(?=\[\d+\])/gm).map(normalizeWhitespace).filter((s) => s.length > 5)
  const numberedCount = section.match(/^\s*\d{1,2}\.\s+\S/gm)?.length ?? 0
  if (numberedCount >= 2) return section.split(/^\s*(?=\d{1,2}\.\s)/gm).map(normalizeWhitespace).filter((s) => s.length > 5)
  return null
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function parseEntry(raw: string): ParsedReference {
  // stripped 去掉编号、URL、DOI、arXiv 标记，避免年份/标题从这些串里误提取
  const stripped = raw
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^\d{1,2}\.\s+/, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b10\.\d{4,9}\/\S+/gi, " ")
    .replace(/arXiv:\S+/gi, " ")
  const segments = stripped
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.replace(/^["'“”‘’]+|["'“”‘’.,;:]+$/g, "").trim())
    // 含 3 位以上连续数字的多为卷期页码/年份段，不做标题候选
    .filter((segment) => segment.length > 8 && !/\d{3,}/.test(segment))
  const title =
    segments.filter((segment) => !looksLikeAuthors(segment)).sort((a, b) => b.length - a.length)[0] ??
    segments.sort((a, b) => b.length - a.length)[0]
  const yearMatch = Array.from(stripped.matchAll(/\b(?:19|20)\d{2}\b/g)).at(-1)
  const doi = findDoi(raw)
  const arxivId = findArxivId(raw)
  return {
    raw,
    ...(doi ? { doi } : {}),
    ...(arxivId ? { arxivId } : {}),
    ...(title ? { title } : {}),
    ...(yearMatch ? { year: Number(yearMatch[0]) } : {}),
  }
}

function looksLikeAuthors(segment: string): boolean {
  const parts = segment.split(/,|\band\b/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return false
  return parts.every((part) => /^[A-Z][A-Za-z.'-]*(\s+[A-Z][A-Za-z.'-]*)*$/.test(part))
}
