import type { Section, GlossaryEntry, TranslationResult } from "./types"

export function splitIntoSections(text: string): Section[] {
  const sections: Section[] = []
  const sectionRegex = /^(Abstract|Introduction|Related Work|Method|Experiments|Conclusion)s?\s*$/gim
  const parts = text.split(sectionRegex)

  if (parts.length < 2) {
    sections.push({ type: "abstract", title: "Full Text", paragraphs: text.split(/\n\n+/).filter(Boolean) })
    return sections
  }

  return sections
}

export function preserveFormula(text: string): { text: string; formulas: string[] } {
  const formulas: string[] = []
  const preserved = text.replace(/(\$\$.+?\$\$|\$.+?\$)/gs, (match) => {
    formulas.push(match)
    return `{{FORMULA_${formulas.length - 1}}}`
  })
  return { text: preserved, formulas }
}

export function restoreFormula(text: string, formulas: string[]): string {
  return text.replace(/\{\{FORMULA_(\d+)\}\}/g, (_, i) => formulas[parseInt(i)])
}

export function stubTranslate(text: string): string {
  return `[译] ${text}`
}

export function extractGlossary(translated: string): GlossaryEntry[] {
  return [{ en: "attention", zh: "注意力", domain: "ML" }, { en: "transformer", zh: "变换器", domain: "ML" }]
}

export function buildTranslationResult(
  paperId: string,
  sections: Section[],
): TranslationResult {
  return {
    paperId,
    sections: sections.map((s) => ({
      type: s.type,
      title: s.title,
      original: s.paragraphs,
      translated: s.paragraphs.map(stubTranslate),
    })),
    glossary: [
      { en: "attention", zh: "注意力" },
      { en: "transformer", zh: "变换器" },
    ],
  }
}

export function toBilingualHtml(result: TranslationResult): string {
  let html = "<html><body>"
  for (const sec of result.sections) {
    html += `<h2>${sec.title}</h2>`
    for (let i = 0; i < sec.original.length; i++) {
      html += `<div style="display:flex;gap:16px;margin-bottom:8px">`
      html += `<div style="flex:1;font-size:12px">${sec.original[i]}</div>`
      html += `<div style="flex:1;font-size:12px">${sec.translated[i] || ""}</div>`
      html += `</div>`
    }
  }
  html += "</body></html>"
  return html
}
