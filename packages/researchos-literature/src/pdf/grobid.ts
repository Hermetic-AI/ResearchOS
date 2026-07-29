import type { ParsedReference } from "./references"

export function parseGrobidReferences(teiXml: string): ParsedReference[] {
  return extractBlocks(teiXml, "biblStruct").map((block) => {
    const container = extractBlocks(block, "analytic")[0] ?? extractBlocks(block, "monogr")[0]
    const title = container ? extractTag(container, "title") : undefined
    const doi = extractIdno(block, "DOI")
    const arxivId = extractIdno(block, "arXiv")
    const when = /when="(\d{4})/.exec(block)?.[1]
    return {
      raw: block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      ...(title ? { title: title.trim() } : {}),
      ...(doi ? { doi: doi.trim() } : {}),
      ...(arxivId ? { arxivId: arxivId.trim() } : {}),
      ...(when ? { year: Number(when) } : {}),
    }
  })
}

export async function fetchGrobidReferences(pdfData: Uint8Array, baseUrl: string): Promise<ParsedReference[]> {
  const form = new FormData()
  form.append("input", new Blob([pdfData.slice()], { type: "application/pdf" }), "paper.pdf")
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/processReferences`, { method: "POST", body: form })
  if (!response.ok) throw new Error(`GROBID processReferences failed: HTTP ${response.status}`)
  return parseGrobidReferences(await response.text())
}

function extractBlocks(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g")), (match) => match[1] ?? "")
}

function extractTag(xml: string, tag: string): string | undefined {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]
}

// idno 的 type 属性顺序不固定，逐条检查而不是写死属性位置
function extractIdno(xml: string, type: string): string | undefined {
  return Array.from(xml.matchAll(/<idno(?:\s[^>]*)?>[\s\S]*?<\/idno>/g), (match) => match[0])
    .filter((tag) => new RegExp(`type=["']${type}["']`, "i").test(tag))
    .map((tag) => extractTag(tag, "idno"))[0]
}
