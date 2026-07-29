import MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import Papa from "papaparse"

export function convertCsvToLatex(input: { csv: string; caption?: string; label?: string }): string {
  const parsed = Papa.parse<string[]>(input.csv.trim(), { skipEmptyLines: true })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`Invalid CSV: ${parsed.errors[0]?.message ?? "parse error"}`)
  }
  const rows = parsed.data
  const header = rows[0]
  const body = rows.slice(1)
  if (!header || body.length === 0) throw new Error("CSV needs a header row and at least one data row")
  const numeric = header.map((_, column) =>
    body.every((row) => /^-?\d+(\.\d+)?$/.test((row[column] ?? "").trim())),
  )
  return latexTable({
    header: header.map((cell) => cell.trim()),
    body: body.map((row) => row.map((cell) => (cell ?? "").trim())),
    numeric,
    ...(input.caption ? { caption: input.caption } : {}),
    ...(input.label ? { label: input.label } : {}),
  })
}

export interface TableSpec {
  header: string[]
  body: string[][]
  numeric: boolean[]
  caption?: string
  label?: string
}

export function latexTable(spec: TableSpec): string {
  const colSpec = spec.numeric.map((isNumeric) => (isNumeric ? "r" : "l")).join("")
  const row = (cells: string[]) => `    ${cells.map(escapeLatex).join(" & ")} \\\\`
  return [
    "\\begin{table}[htbp]",
    "  \\centering",
    ...(spec.caption ? [`  \\caption{${escapeLatex(spec.caption)}}`] : []),
    ...(spec.label ? [`  \\label{${escapeLatex(spec.label)}}`] : []),
    `  \\begin{tabular}{${colSpec}}`,
    "    \\toprule",
    row(spec.header),
    "    \\midrule",
    ...spec.body.map(row),
    "    \\bottomrule",
    "  \\end{tabular}",
    "\\end{table}",
  ].join("\n")
}

// 转义集合按设计 §6.1：% & _ #（$ 保留给数学透传）
export function escapeLatex(value: string): string {
  return value.replace(/[%&_#]/g, (char) => `\\${char}`)
}

const md = new MarkdownIt()

// markdown-it token 流白名单转换；不支持的 token 原样保留并加 TODO 注释（设计 §6.1）
export function convertMdToLatex(markdown: string): string {
  const tokens = md.parse(markdown, {})
  const out: string[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.type === "heading_open") {
      const inline = tokens[index + 1]
      out.push(`${headingCommand(token.tag)}{${inline?.type === "inline" ? renderInline(inline.children ?? []) : ""}}`)
      index += 3
      continue
    }
    if (token.type === "paragraph_open") {
      const inline = tokens[index + 1]
      if (inline?.type === "inline") out.push(renderInline(inline.children ?? []))
      index += 3
      continue
    }
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const env = token.type === "bullet_list_open" ? "itemize" : "enumerate"
      const close = token.type === "bullet_list_open" ? "bullet_list_close" : "ordered_list_close"
      const body: Token[] = []
      index += 1
      while (index < tokens.length && tokens[index]!.type !== close) {
        body.push(tokens[index]!)
        index += 1
      }
      out.push(renderList(env, body))
      index += 1
      continue
    }
    if (token.type === "fence" || token.type === "code_block") {
      out.push(`\\begin{lstlisting}\n${token.content.replace(/\n$/, "")}\n\\end{lstlisting}`)
      index += 1
      continue
    }
    if (token.type === "hr") {
      out.push("\\par\\noindent\\rule{\\linewidth}{0.4pt}")
      index += 1
      continue
    }
    if (token.type === "table_open") {
      const body: Token[] = []
      index += 1
      while (index < tokens.length && tokens[index]!.type !== "table_close") {
        body.push(tokens[index]!)
        index += 1
      }
      out.push(renderTable(body))
      index += 1
      continue
    }
    if (token.type === "blockquote_open") {
      const body: Token[] = []
      index += 1
      while (index < tokens.length && tokens[index]!.type !== "blockquote_close") {
        body.push(tokens[index]!)
        index += 1
      }
      const text = body
        .filter((item) => item.type === "inline")
        .map((item) => renderInline(item.children ?? []))
        .join("\n")
      out.push(`\\begin{quote}\n${text}\n\\end{quote}`)
      index += 1
      continue
    }
    out.push(`% TODO: unsupported token '${token.type}'${token.content ? `: ${token.content.split("\n")[0]}` : ""}`)
    index += 1
  }
  return out.filter((block) => block.trim().length > 0).join("\n\n")
}

const HEADINGS: Record<string, string> = {
  h1: "\\section*",
  h2: "\\subsection*",
  h3: "\\subsubsection*",
  h4: "\\paragraph*",
  h5: "\\paragraph*",
  h6: "\\paragraph*",
}

function headingCommand(tag: string): string {
  return HEADINGS[tag] ?? "\\section*"
}

function renderList(env: string, tokens: Token[]): string {
  const items: string[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.type === "list_item_open") {
      const parts: string[] = []
      index += 1
      while (index < tokens.length && tokens[index]!.type !== "list_item_close") {
        const inner = tokens[index]!
        if (inner.type === "inline") parts.push(renderInline(inner.children ?? []))
        index += 1
      }
      items.push(`  \\item ${parts.join(" ")}`)
    }
    index += 1
  }
  return `\\begin{${env}}\n${items.join("\n")}\n\\end{${env}}`
}

function renderTable(tokens: Token[]): string {
  const rows: string[][] = []
  let current: string[] | undefined
  tokens.forEach((token) => {
    if (token.type === "tr_open") current = []
    if (token.type === "tr_close" && current) {
      rows.push(current)
      current = undefined
    }
    if (token.type === "inline" && current) current.push(renderInline(token.children ?? []))
  })
  const header = rows[0] ?? []
  const body = rows.slice(1)
  return latexTable({ header, body, numeric: header.map(() => false) })
}

function renderInline(tokens: Token[]): string {
  const out: string[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.type === "text") out.push(escapeLatex(token.content))
    if (token.type === "code_inline") out.push(`\\texttt{${token.content}}`)
    if (token.type === "strong_open") {
      const inner = collectUntil(tokens, index + 1, "strong_close")
      out.push(`\\textbf{${renderInline(inner)}}`)
      index += inner.length + 1
    }
    if (token.type === "em_open") {
      const inner = collectUntil(tokens, index + 1, "em_close")
      out.push(`\\textit{${renderInline(inner)}}`)
      index += inner.length + 1
    }
    if (token.type === "link_open") {
      const inner = collectUntil(tokens, index + 1, "link_close")
      const href = token.attrGet("href") ?? ""
      out.push(`${renderInline(inner)} (\\url{${href}})`)
      index += inner.length + 1
    }
    if (token.type === "softbreak") out.push(" ")
    if (token.type === "hardbreak") out.push("\\\\")
    if (token.type === "image") out.push(`% TODO: unsupported token 'image': ${token.attrGet("src") ?? token.content}`)
    if (token.type === "html_inline") out.push(`% TODO: unsupported token 'html_inline': ${token.content}`)
    const handled = ["text", "code_inline", "strong_open", "em_open", "link_open", "softbreak", "hardbreak", "image", "html_inline"]
    if (!handled.includes(token.type)) out.push(`% TODO: unsupported token '${token.type}'`)
    index += 1
  }
  return out.join("")
}

function collectUntil(tokens: Token[], start: number, closeType: string): Token[] {
  const inner: Token[] = []
  let index = start
  while (index < tokens.length && tokens[index]!.type !== closeType) {
    inner.push(tokens[index]!)
    index += 1
  }
  return inner
}
