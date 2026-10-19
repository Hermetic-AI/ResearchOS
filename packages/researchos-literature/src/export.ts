import { formatCitations } from "./cite"
import type { CitationStyle, PaperMeta } from "./types"

export function toBibtex(paper: PaperMeta): string {
  const type = paper.venue ? "inproceedings" : "article"
  const key = bibtexKey(paper)
  const fields: string[] = []
  fields.push(`  title = {${paper.title}}`)
  if (paper.authors.length > 0) {
    fields.push(`  author = {${paper.authors.map((a) => a.name).join(" and ")}}`)
  }
  if (paper.year) fields.push(`  year = {${paper.year}}`)
  if (paper.venue) fields.push(`  booktitle = {${paper.venue}}`)
  if (paper.doi) fields.push(`  doi = {${paper.doi}}`)
  if (paper.abstract) fields.push(`  abstract = {${paper.abstract}}`)
  return `@${type}{${key},\n${fields.join(",\n")}\n}`
}

function bibtexKey(paper: PaperMeta): string {
  const firstAuthor = paper.authors[0]?.name?.split(" ").pop()?.toLowerCase() ?? "unknown"
  const year = paper.year ?? "0000"
  const titleWord = paper.title.split(" ")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "untitled"
  return `${firstAuthor}${year}${titleWord}`
}

export function toRis(paper: PaperMeta): string {
  const lines: string[] = []
  lines.push("TY  - JOUR")
  lines.push(`TI  - ${paper.title}`)
  for (const author of paper.authors) {
    lines.push(`AU  - ${author.name}`)
  }
  if (paper.year) lines.push(`PY  - ${paper.year}`)
  if (paper.venue) lines.push(`JO  - ${paper.venue}`)
  if (paper.doi) lines.push(`DO  - ${paper.doi}`)
  if (paper.abstract) lines.push(`AB  - ${paper.abstract}`)
  lines.push("ER  - ")
  return lines.join("\n")
}

export function toEndnote(paper: PaperMeta): string {
  const lines: string[] = []
  lines.push(`%0 Journal Article`)
  lines.push(`%T ${paper.title}`)
  for (const author of paper.authors) {
    lines.push(`%A ${author.name}`)
  }
  if (paper.year) lines.push(`%D ${paper.year}`)
  if (paper.venue) lines.push(`%J ${paper.venue}`)
  if (paper.doi) lines.push(`%R ${paper.doi}`)
  return lines.join("\n")
}

export function toMarkdown(paper: PaperMeta): string {
  const authors = paper.authors.map((a) => a.name).join(", ")
  const lines: string[] = [
    `# ${paper.title}`,
    "",
    `**Authors**: ${authors}`,
  ]
  if (paper.year || paper.venue) {
    lines.push(`**Published**: ${[paper.year, paper.venue].filter(Boolean).join(" — ")}`)
  }
  if (paper.doi) lines.push(`**DOI**: [${paper.doi}](https://doi.org/${paper.doi})`)
  if (paper.abstract) {
    lines.push("", "## Abstract", "", paper.abstract)
  }
  return lines.join("\n")
}

// format 与 style 同时给时，markdown 输出为 CSL 渲染后的编号引用列表（§6.3）
export async function toStyledMarkdown(papers: PaperMeta[], style: CitationStyle): Promise<string> {
  const lines = await formatCitations(papers, style)
  return ["# References", "", ...lines.map((line, index) => `${index + 1}. ${line}`)].join("\n")
}
