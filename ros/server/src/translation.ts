export * as Translation from "./translation"

export interface Term {
  source: string
  target: string
  note?: string | null
}

export type ProtectKind = "formula" | "cite" | "caption" | "number"

export interface ProtectedToken {
  kind: ProtectKind
  text: string
}

export interface AuditResult {
  counts: Record<ProtectKind, number>
  tokens: ProtectedToken[]
  leaks: ProtectedToken[]
  applied: string[]
  skipped: string[]
}

export interface SegmentRow {
  id?: string
  section: string
  seq: number
  page: number | null
  source: string
  target: string
  status: string
}

export type TermStatus = "used" | "missing" | "pending" | "unused"

export interface TermRow {
  source: string
  target: string
  note: string
  count: number
  status: TermStatus
}

export interface SectionRollup {
  section: string
  total: number
  final: number
  draft: number
  todo: number
  protected: Record<ProtectKind, number>
}

export interface DraftAudit {
  segments: number
  translated: number
  sections: SectionRollup[]
  terms: TermRow[]
  protected_total: number
  leaks: Array<{ section: string; seq: number; kind: ProtectKind; text: string }>
}

const FORMULA = /\$\$[^$]*\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\begin\{[^{}]*\}[\s\S]*?\\end\{[^{}]*\}|[−≤≥±×÷√∑∞≈≠]/g
const CITE = /\\cite[a-zA-Z]*\{[^{}]*\}|\[\d{1,3}(?:[,–-]\s*\d{1,3})*\]|\(\d{4}[a-z]?\)/g
const CAPTION = /(?:Fig\.|Figure|Tab\.|Table|Algorithm|Listing)\s*\d+(?:\.\d+)?/gi
const UNITS = "%|‰|px|GB|MB|KB|TB|ms|min|steps?|seconds?|epochs?|samples?|layers?|parameters?|seeds?|iters?|iterations?|NFEs|FID"
const NUMBER = new RegExp(
  String.raw`(?<![\w.,])\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s?(?:${UNITS}|[x×]))?(?!\w)(?!\.\d)`,
  "g",
)

// Ordered so later kinds are searched in text already stripped of earlier matches,
// which keeps the digits inside math or citations from being counted as plain numbers.
const PATTERNS: Array<[ProtectKind, RegExp]> = [
  ["formula", FORMULA],
  ["cite", CITE],
  ["caption", CAPTION],
  ["number", NUMBER],
]

const KINDS: ProtectKind[] = PATTERNS.map(([kind]) => kind)

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }

export function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  return haystack.split(needle).length - 1
}

function contains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

// Every protected run is a literal substring the translated draft must carry through unchanged.
export function protect(text: string): ProtectedToken[] {
  const tokens: ProtectedToken[] = []
  let rest = text
  for (const [kind, pattern] of PATTERNS) {
    for (const match of rest.matchAll(pattern)) tokens.push({ kind, text: match[0] })
    rest = rest.replace(pattern, " ")
  }
  return tokens
}

export function countByKind(tokens: ProtectedToken[]): Record<ProtectKind, number> {
  const counts = emptyCounts()
  for (const token of tokens) counts[token.kind] += 1
  return counts
}

function emptyCounts(): Record<ProtectKind, number> {
  return { formula: 0, cite: 0, caption: 0, number: 0 }
}

export function tokensOf(text: string, kind: ProtectKind): string[] {
  return protect(text)
    .filter((token) => token.kind === kind)
    .map((token) => token.text)
}

// How each protected run has to survive depends on its kind: math and citation keys are
// verbatim, but a number keeps only its digits and a caption only its reference number,
// because "50 steps" → "50 步" and "Figure 2" → "图 2" are correct translations.
function kept(target: string, token: ProtectedToken): boolean {
  if (token.kind === "number") {
    const digits = /\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(token.text)?.[0] ?? ""
    if (digits.length > 0) return target.includes(digits)
  }
  if (token.kind === "caption") {
    const num = /\d+(?:\.\d+)?$/.exec(token.text)?.[0] ?? ""
    if (num.length > 0) return new RegExp(String.raw`(?:图|表|公式|算法|Figure|Fig\.?|Table|Tab\.?|Equation|Algorithm)\s*${num}(?![\d.])`).test(target)
  }
  return target.includes(token.text)
}

export function auditSegment(source: string, target: string, terms: Term[]): AuditResult {
  const tokens = protect(source)
  const applied: string[] = []
  const skipped: string[] = []
  for (const term of terms) {
    if (!contains(source, term.source)) continue
    if (target.includes(term.target)) applied.push(term.source)
    else skipped.push(term.source)
  }
  return {
    counts: countByKind(tokens),
    tokens,
    leaks: tokens.filter((token) => !kept(target, token)),
    applied,
    skipped,
  }
}

// Draft-wide rollup for the section tree, the glossary rail and the protection note.
export function auditDraft(segments: SegmentRow[], terms: Term[]): DraftAudit {
  const translated = segments.filter((segment) => segment.target.trim().length > 0)
  const joined = translated.map((segment) => segment.target).join("\n")
  const sourceText = segments.map((segment) => segment.source).join("\n")
  const leaks: DraftAudit["leaks"] = []
  const sections: SectionRollup[] = []
  for (const segment of segments) {
    let rollup = sections.find((row) => row.section === segment.section)
    if (!rollup) {
      rollup = { section: segment.section, total: 0, final: 0, draft: 0, todo: 0, protected: emptyCounts() }
      sections.push(rollup)
    }
    rollup.total += 1
    if (segment.status === "final") rollup.final += 1
    if (segment.status === "draft") rollup.draft += 1
    if (segment.status === "todo") rollup.todo += 1
    const counts = countByKind(protect(segment.source))
    for (const kind of KINDS) rollup.protected[kind] += counts[kind]
    if (segment.target.trim().length === 0) continue
    for (const token of auditSegment(segment.source, segment.target, []).leaks) {
      leaks.push({ section: segment.section, seq: segment.seq, kind: token.kind, text: token.text })
    }
  }
  const rows: TermRow[] = terms.map((term) => {
    const count = occurrences(joined, term.target)
    const status: TermStatus =
      term.target.trim().length === 0
        ? "pending"
        : count > 0
          ? "used"
          : contains(sourceText, term.source) && translated.length > 0
            ? "missing"
            : "unused"
    return { source: term.source, target: term.target, note: term.note ?? "", count, status }
  })
  const protectedTotal = segments.reduce((sum, segment) => sum + protect(segment.source).length, 0)
  return {
    segments: segments.length,
    translated: translated.length,
    sections,
    terms: rows.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    protected_total: protectedTotal,
    leaks,
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char)
}

export function toMarkdown(title: string, segments: SegmentRow[]): string {
  const rows = segments.filter((segment) => segment.target.trim().length > 0)
  const body = rows
    .map((segment) => `## ${segment.section} ¶${segment.seq}\n\n${segment.target}\n\n> 原文：${segment.source}\n`)
    .join("\n---\n\n")
  return `# ${title}\n\n> ResearchOS 学术翻译导出 · 已译 ${rows.length}/${segments.length} 段\n\n${body}`
}

export function toBilingualHtml(title: string, segments: SegmentRow[]): string {
  const cards = segments.map((segment) => {
    const badge = segment.page === null ? "" : ` · p.${segment.page}`
    return `<section class="para" data-status="${segment.status}">
<h3>${escapeHtml(segment.section)} ¶${segment.seq}${badge}</h3>
<p class="zh">${escapeHtml(segment.target)}</p>
<p class="en">${escapeHtml(segment.source)}</p>
</section>`
  })
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${escapeHtml(title)} · 双语对照</title>
<style>
body { font-family: "Noto Serif SC", Georgia, serif; max-width: 880px; margin: 3rem auto; line-height: 1.8; color: #1F2A33; }
h1 { font-size: 1.5rem; }
h3 { font-variant: all-small-caps; letter-spacing: .12em; color: #6B7280; font-size: .8rem; margin-top: 2rem; }
.para { border-left: 2px solid #E7E3D8; padding-left: 1rem; }
.zh { margin: 0; }
.en { margin: .35rem 0 0; color: #6B7280; font-size: .85em; }
[data-status="final"] { border-left-color: #5A6E4A; }
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
${cards.join("\n")}
</body>
</html>`
}
