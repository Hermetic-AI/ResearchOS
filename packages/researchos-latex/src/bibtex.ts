import type { BibtexEntry } from "./types"

export function parseBibtex(content: string): BibtexEntry[] {
  const entries: BibtexEntry[] = []
  const clean = content.replace(/%.*/g, "")
  const entryRegex = /@(\w+)\s*\{\s*(\w+)\s*,\s*\n([\s\S]*?)\n\s*\}/g
  for (const match of clean.matchAll(entryRegex)) {
    const type = match[1].toLowerCase()
    const key = match[2]
    const fieldsBody = match[3]
    const fields: Record<string, string> = {}
    const fieldRegex = /\s*(\w+)\s*=\s*\{([^}]*)\}/g
    for (const fm of fieldsBody.matchAll(fieldRegex)) {
      fields[fm[1].toLowerCase()] = fm[2]
    }
    entries.push({ type, key, fields })
  }
  return entries
}

export function extractCiteKeys(content: string): string[] {
  const keys = new Set<string>()
  const citeRegex = /\\cite\{([^}]+)\}/g
  for (const match of content.matchAll(citeRegex)) {
    for (const k of match[1].split(",")) {
      keys.add(k.trim())
    }
  }
  return Array.from(keys)
}

export function formatCheck(content: string, template?: string): Array<{ file: string; line: number; rule: string; message: string }> {
  const issues: Array<{ file: string; line: number; rule: string; message: string }> = []
  const lines = content.split("\n")
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes("\\begin{document}") && !content.includes("\\title{")) {
      issues.push({ file: "", line: i + 1, rule: "missing-title", message: "Paper has no \\title declaration" })
    }
    if (line.includes("\\cite{") && !line.includes("\\bibliography{")) {
      issues.push({ file: "", line: i + 1, rule: "cite-before-bib", message: "\\cite used but no \\bibliography found" })
    }
  }

  if (template === "ieee" && !content.includes("\\documentclass[conference]{IEEEtran}")) {
    issues.push({ file: "", line: 0, rule: "ieee-class", message: "IEEE template requires IEEEtran documentclass" })
  }

  return issues
}
