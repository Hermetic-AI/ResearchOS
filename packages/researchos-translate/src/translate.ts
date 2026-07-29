import type { GlossaryEntry, Section, TranslationResult } from "./types"

const headings: Record<string, Section["type"]> = { abstract: "abstract", introduction: "introduction", "related work": "related_work", method: "method", methodology: "method", experiments: "experiments", results: "experiments", conclusion: "conclusion" }
export function splitIntoSections(text: string): Section[] {
  const result: Section[] = []
  let current: Section = { type: "abstract", title: "Full Text", paragraphs: [] }
  text.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const normalized = line.toLowerCase().replace(/^\d+(\.\d+)*\s*/, "").replace(/s$/, "")
    const type = headings[normalized]
    if (type) { if (current.paragraphs.length) result.push(current); current = { type, title: line, paragraphs: [] }; return }
    current.paragraphs.push(line)
  })
  if (current.paragraphs.length) result.push(current)
  return result
}
export function preserveFormula(text: string) {
  const formulas: string[] = []
  const preserved = text.replace(/(\$\$.+?\$\$|\$.+?\$|\\\[.+?\\\]|(?:Fig\.?|Figure|Table|Equation)\s+\d+[a-z]?|\d+(?:\.\d+)?\s*(?:%|ms|GB|MB|Hz))/gis, (match) => { formulas.push(match); return `__RESEARCHOS_PROTECTED_${formulas.length - 1}__` })
  return { text: preserved, formulas }
}
export function restoreFormula(text: string, formulas: string[]) { return text.replace(/__RESEARCHOS_PROTECTED_(\d+)__/g, (match, index) => formulas[Number(index)] ?? match) }
export function extractGlossary(_translated: string): GlossaryEntry[] { return [] }
export function buildTranslationResult(paperId: string, sections: Section[], translated?: string[][]): TranslationResult { return { paperId, sections: sections.map((section, index) => ({ type: section.type, title: section.title, original: section.paragraphs, translated: translated?.[index] ?? [] })), glossary: [] } }
export function toBilingualHtml(result: TranslationResult) { return `<!doctype html><meta charset="utf-8"><title>${escape(result.paperId)}</title><style>body{font:14px system-ui;max-width:1200px;margin:auto;padding:24px}.row{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:12px 0;border-bottom:1px solid #ddd}</style>${result.sections.map((section) => `<h2>${escape(section.title)}</h2>${section.original.map((source, index) => `<div class="row"><div>${escape(source)}</div><div>${escape(section.translated[index] ?? "")}</div></div>`).join("")}`).join("")}` }
function escape(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;") }
