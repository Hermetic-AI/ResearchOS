export function csvToLatex(csv: string, caption?: string, label?: string): string {
  const lines = csv.trim().split("\n")
  if (lines.length < 2) return ""

  const header = lines[0].split(",").map((h) => h.trim())
  const body = lines.slice(1)

  const cols = header.length
  const colSpec = "l".repeat(cols)

  let result = "\\begin{table}[htbp]\n"
  result += "  \\centering\n"
  if (caption) result += `  \\caption{${caption}}\n`
  if (label) result += `  \\label{${label}}\n`
  result += `  \\begin{tabular}{${colSpec}}\n`
  result += "    \\toprule\n"
  result += "    " + header.map((h) => escapeLatex(h)).join(" & ") + " \\\\\n"
  result += "    \\midrule\n"

  for (const row of body) {
    const cells = row.split(",").map((c) => c.trim())
    result += "    " + cells.map((c) => escapeLatex(c)).join(" & ") + " \\\\\n"
  }

  result += "    \\bottomrule\n"
  result += "  \\end{tabular}\n"
  result += "\\end{table}"
  return result
}

export function mdToLatex(md: string): string {
  let result = md
  result = result.replace(/^### (.+)$/gm, "\\subsubsection*{$1}")
  result = result.replace(/^## (.+)$/gm, "\\subsection*{$1}")
  result = result.replace(/^# (.+)$/gm, "\\section*{$1}")
  result = result.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}")
  result = result.replace(/\*(.+?)\*/g, "\\textit{$1}")
  result = result.replace(/`([^`]+)`/g, "\\texttt{$1}")
  result = result.replace(/^\s*[-*]\s+(.+)$/gm, "\\begin{itemize}\n  \\item $1\n\\end{itemize}")
  result = result.replace(/\$\$(.+?)\$\$/gs, "\\begin{equation}\n  $1\n\\end{equation}")
  result = result.replace(/\$(.+?)\$/g, "\\($1\\)")
  return result
}

export function codeToAlgorithm(code: string, _func?: string, _pkg?: string): string {
  const lines = code.trim().split("\n").filter((l) => l.trim())
  let result = "\\begin{algorithm}[htbp]\n"
  result += "  \\caption{Algorithm}\n"
  result += "  \\begin{algorithmic}[1]\n"
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("if ")) result += `    \\If{${escapeLatex(trimmed.slice(3))}}\n`
    else if (trimmed.startsWith("for ")) result += `    \\For{${escapeLatex(trimmed.slice(4))}}\n`
    else if (trimmed.startsWith("return ")) result += `    \\State \\Return ${escapeLatex(trimmed.slice(7))}\n`
    else result += `    \\State ${escapeLatex(trimmed)}\n`
  }
  result += "  \\end{algorithmic}\n"
  result += "\\end{algorithm}"
  return result
}

function escapeLatex(s: string): string {
  return s.replace(/[&%$#_{}~^\\]/g, "\\$&")
}
