import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

export async function extractPdfText(data: Uint8Array, maxPages?: number): Promise<string> {
  // 传副本：pdfjs 会 detach 传入的 buffer，同一 data 二次提取会 DataCloneError
  const task = getDocument({ data: data.slice(), useSystemFonts: true })
  const doc = await task.promise
  try {
    const pageCount = Math.min(doc.numPages, maxPages ?? doc.numPages)
    const texts = await Promise.all(
      Array.from({ length: pageCount }, (_, i) => doc.getPage(i + 1).then(extractPageText)),
    )
    return texts.join("\n")
  } finally {
    await task.destroy()
  }
}

async function extractPageText(page: {
  getTextContent(): Promise<{ items: unknown[] }>
}): Promise<string> {
  const content = await page.getTextContent()
  const items = content.items
    .filter((item): item is { str: string; transform: number[] } => {
      if (typeof item !== "object" || item === null) return false
      const candidate = item as { str?: unknown; transform?: unknown }
      return typeof candidate.str === "string" && Array.isArray(candidate.transform)
    })
    .filter((item) => item.str.trim().length > 0)
  const lines = new Map<number, Array<{ x: number; str: string }>>()
  items.forEach((item) => {
    const y = Math.round(item.transform[5] ?? 0)
    const row = lines.get(y) ?? []
    row.push({ x: item.transform[4] ?? 0, str: item.str })
    lines.set(y, row)
  })
  return Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}
