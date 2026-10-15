import { z } from "zod"

// §6.2 五工具契约（MCP server、server handler、SubAgent prompt 共用）

export const RunPythonInput = z.object({
  code: z.string(),
  workdir: z.string(),
  timeout_s: z.number().int().min(1).max(600).default(120),
  cell_id: z.string().optional(),
})
export type RunPythonInput = z.infer<typeof RunPythonInput>

export const RunPythonOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  artifacts: z.array(z.string()),
  duration_ms: z.number(),
  error: z.object({ type: z.string(), message: z.string(), traceback: z.string() }).optional(),
})
export type RunPythonOutput = z.infer<typeof RunPythonOutput>

export const ProfileInput = z.object({ file: z.string() })
export type ProfileInput = z.infer<typeof ProfileInput>

export const ProfileOutput = z.object({
  schema: z.array(z.object({
    name: z.string(),
    dtype: z.string(),
    null_count: z.number(),
    unique_count: z.number(),
  })),
  stats: z.record(z.string(), z.object({
    mean: z.number(), std: z.number(), min: z.number(),
    p25: z.number(), p50: z.number(), p75: z.number(), max: z.number(),
  }).partial()),
  anomalies: z.array(z.object({
    column: z.string(),
    kind: z.string(),
    detail: z.string(),
  })),
})
export type ProfileOutput = z.infer<typeof ProfileOutput>

export const StatTestInput = z.object({
  file: z.string(),
  test: z.enum(["ttest", "mannwhitney", "anova", "kruskal", "chi2", "shapiro", "pearson", "spearman"]),
  columns: z.array(z.string()).min(1),
  params: z.record(z.string(), z.unknown()).optional(),
})
export type StatTestInput = z.infer<typeof StatTestInput>

export const StatTestOutput = z.object({
  statistic: z.number(),
  p_value: z.number(),
  conclusion: z.string(),
  test_id: z.string(),
})
export type StatTestOutput = z.infer<typeof StatTestOutput>

export const ChartInput = z.object({
  file: z.string(),
  kind: z.enum(["line", "bar", "scatter", "hist", "box", "heatmap", "pair"]),
  spec: z.record(z.string(), z.unknown()),
  format: z.enum(["pdf", "svg", "png"]),
  dpi: z.number().int().min(72).max(1200).default(300),
})
export type ChartInput = z.infer<typeof ChartInput>

export const ChartOutput = z.object({
  artifact_path: z.string(),
  preview_svg: z.string(),
  latex_snippet: z.string().optional(),
  artifact_id: z.string(),
})
export type ChartOutput = z.infer<typeof ChartOutput>

export const LinkExperimentInput = z.object({
  artifact_path: z.string(),
  commit: z.string().optional(),
  tex_file: z.string().optional(),
  tex_section: z.string().optional(),
})
export type LinkExperimentInput = z.infer<typeof LinkExperimentInput>

export const LinkExperimentOutput = z.object({ ok: z.literal(true) })
export type LinkExperimentOutput = z.infer<typeof LinkExperimentOutput>
