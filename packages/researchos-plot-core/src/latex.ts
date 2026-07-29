import { basename, extname } from "path"

export function includeGraphicsSnippet(input: { path: string; caption: string; label?: string; width?: string }) {
  const label = input.label ?? `fig:${slug(basename(input.path, extname(input.path)))}`
  return [
    "\\begin{figure}[htbp]",
    "  \\centering",
    `  \\includegraphics[width=${input.width ?? "0.8\\linewidth"}]{${input.path.replaceAll("\\", "/")}}`,
    `  \\caption{${escapeLatex(input.caption)}}`,
    `  \\label{${label}}`,
    "\\end{figure}",
  ].join("\n")
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "figure"
}

function escapeLatex(value: string) {
  return value.replace(/([#$%&_{}])/g, "\\$1")
}
