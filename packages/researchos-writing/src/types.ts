import { z } from "zod"

export const RewriteStyle = z.enum(["academic", "concise", "passive"])
export type RewriteStyle = z.infer<typeof RewriteStyle>

export const RewriteRequest = z.object({
  text: z.string(),
  style: RewriteStyle,
})

export const TitleRequest = z.object({
  abstract: z.string(),
  keywords: z.array(z.string()).optional(),
  count: z.number().default(5),
})

export const StructureRequest = z.object({
  topic: z.string(),
  venue: z.string().optional(),
})
