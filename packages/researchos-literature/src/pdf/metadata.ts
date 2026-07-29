export interface PdfMetadata {
  doi: string | null
  arxivId: string | null
  title: string | null
  year: number | null
}

export function parsePdfMetadata(firstPageText: string): PdfMetadata {
  const yearMatch = /\b(?:19|20)\d{2}\b/.exec(firstPageText)
  return {
    doi: findDoi(firstPageText),
    arxivId: findArxivId(firstPageText),
    title: guessTitle(firstPageText),
    year: yearMatch ? Number(yearMatch[0]) : null,
  }
}

export function normalizeDoi(value: string): string {
  return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase()
}

export function findDoi(text: string): string | null {
  const match = /\b10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/i.exec(text)
  if (!match) return null
  const doi = match[0].replace(/[.,;:]+$/, "")
  // 粘连的右括号仅在不成对时剥掉（DOI 本身允许括号）
  return doi.endsWith(")") && !doi.includes("(") ? doi.slice(0, -1) : doi
}

export function findArxivId(text: string): string | null {
  const prefixed = /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?)/i.exec(text)
  if (prefixed?.[1]) return prefixed[1]
  // 裸 ID 的前瞻排除 "/" "." 前缀，避免从 DOI（如 10.48550/arXiv.1706.03762）里误切
  const bare = /(?<![\w/.:])(\d{4}\.\d{4,5}(?:v\d+)?)(?![\w.])/.exec(text)
  return bare?.[1] ?? null
}

function guessTitle(text: string): string | null {
  const candidates = text.split("\n").map((line) => line.trim()).filter((line) => {
    if (line.length < 15 || line.length > 300) return false
    if (line === line.toUpperCase()) return false
    if (findDoi(line) || /^(arxiv:|https?:|\d+$)/i.test(line)) return false
    // 作者/机构行的朴素特征：逗号分隔的名字、邮箱、单位关键词
    if (/[@,]|\bet al\b|\buniversity\b|\binstitute\b|\bdepartment\b/i.test(line)) return false
    return true
  })
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
}
