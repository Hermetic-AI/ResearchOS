import type { ChartSpec } from "./spec"

export function tikzExport(spec: ChartSpec) {
  const options = [
    `xlabel={${escapeTikz(spec.axes.x_label ?? spec.encoding.x)}}`,
    `ylabel={${escapeTikz(spec.axes.y_label ?? spec.encoding.y)}}`,
    spec.axes.y_lim ? `ymin=${spec.axes.y_lim[0]}, ymax=${spec.axes.y_lim[1]}` : undefined,
    `tick label style={font=\\fontsize{${spec.axes.tick_font_size}}{8}\\selectfont}`,
  ].filter((value): value is string => Boolean(value))
  return [
    "\\begin{tikzpicture}",
    `  \\begin{axis}[${options.join(", ")}]`,
    "    % Data are rendered by the reproducible chart.py artifact.",
    "  \\end{axis}",
    "\\end{tikzpicture}",
  ].join("\n")
}

function escapeTikz(value: string) {
  return value.replace(/([#$%&_{}])/g, "\\$1")
}
