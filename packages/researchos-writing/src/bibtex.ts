// 轻量 BibTeX key 提取与追加（设计 §3：entry 切分 + key 查重即可，不需要完整 AST）
export function extractBibKeys(content: string): string[] {
  return Array.from(content.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g), (match) => match[1] ?? "").filter(Boolean)
}

export interface BibtexUpsertResult {
  content: string
  inserted: string[]
  skipped: string[]
}

// 纯函数：合并新条目到现有 bib 内容，重复 key 跳过，原有顺序不动
export function mergeBibtex(existing: string, entries: Array<{ key: string; bibtex: string }>): BibtexUpsertResult {
  const known = new Set(extractBibKeys(existing))
  const fresh = entries.filter((entry) => !known.has(entry.key))
  const skipped = entries.filter((entry) => known.has(entry.key)).map((entry) => entry.key)
  const base = existing.trimEnd()
  const content = [base, ...fresh.map((entry) => entry.bibtex.trim())].filter(Boolean).join("\n\n") + "\n"
  return { content, inserted: fresh.map((entry) => entry.key), skipped }
}
