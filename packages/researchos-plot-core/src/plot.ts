import { z } from "zod"

export const ChartSpec = z.object({
  template: z.enum(["grouped_bar", "scatter_regression", "boxplot", "violin", "survival", "heatmap"]),
  data: z.union([z.object({ file: z.string() }), z.object({ inline: z.array(z.record(z.unknown())) })]),
  theme: z.enum(["nature", "science", "ieee", "prism"]).default("nature"),
  spec: z.record(z.unknown()).optional(),
})

export type ChartSpec = z.infer<typeof ChartSpec>

export const ChartResult = z.object({
  chartId: z.string(),
  artifactPath: z.string(),
  previewSvg: z.string(),
  latexSnippet: z.string().optional(),
})

export type ChartResult = z.infer<typeof ChartResult>

export const JournalThemes = {
  nature: { font: "sans-serif", palette: ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F"] },
  science: { font: "sans-serif", palette: ["#0C4B8E", "#BF382A", "#F2AD00", "#7F8C8D", "#27AE60"] },
  ieee: { font: "serif", palette: ["#0072BD", "#D95319", "#EDB120", "#7E2F8E", "#77AC30"] },
  prism: { font: "sans-serif", palette: ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD"] },
} as const

export function mermaidToSvg(source: string): string {
  return `<svg><!-- stub: ${source.substring(0, 30)}... --></svg>`
}

export function graphvizToSvg(dotSource: string): string {
  return `<svg><!-- dot stub: ${dotSource.substring(0, 30)}... --></svg>`
}

export function tikzExport(_chartId: string): string {
  return `\\begin{tikzpicture}\n  % stub tikz export\n\\end{tikzpicture}`
}

export function insertToPaper(chartId: string, section: string): string {
  return `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=\\textwidth]{figures/${chartId}.pdf}\n  \\caption{Figure for section ${section}}\n  \\label{fig:${chartId}}\n\\end{figure}`
}
