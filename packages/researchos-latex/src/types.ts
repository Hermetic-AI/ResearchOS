import { z } from "zod"

export const CompileRequest = z.object({
  mainFile: z.string(),
  engine: z.enum(["tectonic"]).default("tectonic"),
  workdir: z.string().optional(),
})

export const CompileResult = z.object({
  ok: z.boolean(),
  pdfPath: z.string().optional(),
  log: z.string(),
  errors: z.array(z.object({ file: z.string(), line: z.number(), message: z.string() })),
})

export type CompileResult = z.infer<typeof CompileResult>

export const BibtexEntry = z.object({
  type: z.string(),
  key: z.string(),
  fields: z.record(z.string()),
})

export type BibtexEntry = z.infer<typeof BibtexEntry>

export const FormatCheckResult = z.object({
  issues: z.array(z.object({ file: z.string(), line: z.number(), rule: z.string(), message: z.string() })),
})

export type FormatCheckResult = z.infer<typeof FormatCheckResult>
