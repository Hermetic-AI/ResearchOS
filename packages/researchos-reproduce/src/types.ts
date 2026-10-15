import { z } from "zod"

export const PipelineStep = z.enum(["clone", "analyze", "detect", "env", "run", "compare"])
export type PipelineStep = z.infer<typeof PipelineStep>

export const StepStatus = z.enum(["pending", "running", "done", "failed"])
export type StepStatus = z.infer<typeof StepStatus>

export const PipelineRun = z.object({
  id: z.string(),
  paperUrl: z.string(),
  repoUrl: z.string(),
  steps: z.array(z.object({ step: PipelineStep, status: StepStatus, log: z.string(), startedAt: z.number().optional(), finishedAt: z.number().optional() })),
  createdAt: z.number(),
})

export type PipelineRun = z.infer<typeof PipelineRun>

export const CompareCard = z.object({
  metric: z.string(),
  reported: z.number(),
  reproduced: z.number(),
  diff: z.number(),
  match: z.boolean(),
})

export const DiagnosticReport = z.object({
  version: z.array(z.object({ package: z.string(), required: z.string(), found: z.string() })),
  dependencies: z.array(z.object({ name: z.string(), issue: z.string() })),
  parameters: z.array(z.object({ name: z.string(), expected: z.string(), actual: z.string() })),
  data: z.array(z.object({ path: z.string(), issue: z.string() })),
})

export type DiagnosticReport = z.infer<typeof DiagnosticReport>
