import { z } from "zod"

export const CHART_TEMPLATES = [
  "grouped_bar",
  "scatter_regression",
  "boxplot",
  "violin",
  "survival",
  "heatmap",
] as const

export const JOURNAL_THEMES = ["nature", "science", "ieee", "prism"] as const

export const SignificanceStars = z.enum(["*", "**", "***", "ns"])

export const ChartSpec = z.object({
  template: z.enum(CHART_TEMPLATES),
  theme: z.enum(JOURNAL_THEMES).default("nature"),
  data: z.union([
    z.object({ file: z.string().min(1) }),
    z.object({ inline: z.array(z.record(z.string(), z.unknown())).min(1) }),
  ]),
  encoding: z.object({
    x: z.string().min(1),
    y: z.string().min(1),
    group: z.string().min(1).optional(),
    error: z.enum(["sd", "sem", "ci95"]).optional(),
  }),
  axes: z
    .object({
      x_label: z.string().optional(),
      y_label: z.string().optional(),
      y_lim: z.tuple([z.number(), z.number()]).optional(),
      tick_font_size: z.number().positive().default(7),
    })
    .default({ tick_font_size: 7 }),
  legend: z
    .object({
      show: z.boolean().default(true),
      position: z.string().default("best"),
    })
    .default({ show: true, position: "best" }),
  annotations: z
    .array(
      z.object({
        groups: z.tuple([z.string(), z.string()]),
        p_value: z.number().min(0).max(1),
        stars: SignificanceStars,
      }),
    )
    .default([]),
})

export type ChartSpec = z.infer<typeof ChartSpec>

export function mergeChartSpec(spec: ChartSpec, patch: Record<string, unknown>): ChartSpec {
  return ChartSpec.parse(deepMerge(spec, patch))
}

export function pValueToStars(pValue: number): z.infer<typeof SignificanceStars> {
  if (pValue < 0.001) return "***"
  if (pValue < 0.01) return "**"
  if (pValue < 0.05) return "*"
  return "ns"
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch
  return Object.fromEntries(
    Object.entries({ ...base, ...patch }).map(([key, value]) => [
      key,
      key in base ? deepMerge(base[key], value) : value,
    ]),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
