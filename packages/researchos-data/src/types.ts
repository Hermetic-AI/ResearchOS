import { z } from "zod"

export const DataProfile = z.object({
  file: z.string(),
  rows: z.number(),
  columns: z.number(),
  schema: z.array(z.object({ name: z.string(), type: z.string(), nullable: z.boolean() })),
  stats: z.record(z.string(), z.object({ count: z.number(), mean: z.number().optional(), std: z.number().optional(), min: z.number().optional(), max: z.number().optional() })),
  anomalies: z.array(z.object({ column: z.string(), row: z.number(), issue: z.string() })),
})

export type DataProfile = z.infer<typeof DataProfile>

export const StatTestResult = z.object({
  test: z.string(),
  statistic: z.number(),
  pValue: z.number(),
  conclusion: z.string(),
})

export type StatTestResult = z.infer<typeof StatTestResult>

export const ArtifactLink = z.object({
  artifactPath: z.string(),
  commit: z.string().optional(),
  texSection: z.string().optional(),
})
