import { z } from "zod"

export const SectionType = z.enum(["abstract", "introduction", "related_work", "method", "experiments", "conclusion"])
export type SectionType = z.infer<typeof SectionType>

export const Section = z.object({
  type: SectionType,
  title: z.string(),
  paragraphs: z.array(z.string()),
})

export type Section = z.infer<typeof Section>

export const GlossaryEntry = z.object({
  en: z.string(),
  zh: z.string(),
  domain: z.string().optional(),
})

export type GlossaryEntry = z.infer<typeof GlossaryEntry>

export const TranslationResult = z.object({
  paperId: z.string(),
  sections: z.array(z.object({ type: SectionType, title: z.string(), original: z.array(z.string()), translated: z.array(z.string()) })),
  glossary: z.array(GlossaryEntry),
})

export type TranslationResult = z.infer<typeof TranslationResult>
