import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { relative, resolve } from "path"
import { LiteratureDB } from "@researchos/literature"
import { buildTranslationResult, preserveFormula, restoreFormula, splitIntoSections, toBilingualHtml } from "./translate"
import type { TranslationResult } from "./types"

export async function translatePaper(root: string, input: { paperId: string; sections?: string[]; engine?: "auto" | "api" | "llm" }) {
  const library = new LiteratureDB(root)
  await library.init()
  const paper = library.getPaper(input.paperId)
  library.close()
  if (!paper?.pdfPath) throw new Error(`paper has no archived PDF: ${input.paperId}`)
  const pdf = resolve(root, paper.pdfPath)
  if (!pdf.startsWith(resolve(root))) throw new Error("PDF path escapes project root")
  const extractor = Bun.spawn({ cmd: ["uv", "run", "--directory", resolve(import.meta.dir, "../../researchos-mcp/translate"), "python", "src/server.py", "extract", relative(root, pdf)], cwd: root, env: { ...Bun.env, RESEARCHOS_PROJECT_ROOT: root }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([extractor.exited, new Response(extractor.stdout).text(), new Response(extractor.stderr).text()])
  if (code !== 0) throw new Error(stderr.trim() || `PDF extractor exited with ${code}`)
  const extracted = JSON.parse(stdout) as { blocks: Array<{ kind: string; text: string }> }
  const source = extracted.blocks.map((block) => block.kind === "heading" ? `\n${block.text}\n` : block.text).join("\n")
  const all = splitIntoSections(source)
  const sections = input.sections?.length ? all.filter((section) => input.sections!.includes(section.type)) : all
  const endpoint = process.env.LIBRETRANSLATE_URL
  if (!endpoint) throw new Error("No translation engine configured. Set LIBRETRANSLATE_URL or use the Translator Agent for LLM translation.")
  const translated: string[][] = []
  for (const section of sections) {
    const values = []
    for (const paragraph of section.paragraphs) {
      const protectedText = preserveFormula(paragraph)
      const response = await fetch(new URL("/translate", endpoint), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: protectedText.text, source: "en", target: "zh", format: "text", ...(process.env.LIBRETRANSLATE_API_KEY ? { api_key: process.env.LIBRETRANSLATE_API_KEY } : {}) }) })
      if (!response.ok) throw new Error(`translation engine failed: ${response.status} ${await response.text()}`)
      const payload = await response.json() as { translatedText?: unknown }
      if (typeof payload.translatedText !== "string") throw new Error("translation engine returned no translatedText")
      values.push(restoreFormula(payload.translatedText, protectedText.formulas))
    }
    translated.push(values)
  }
  const result = buildTranslationResult(input.paperId, sections, translated)
  const directory = resolve(root, ".researchos", "translations", safe(input.paperId))
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, "source.md"), source)
  writeFileSync(resolve(directory, "translation.json"), JSON.stringify(result, null, 2))
  writeFileSync(resolve(directory, "translation_zh.md"), result.sections.map((section) => `## ${section.title}\n\n${section.translated.join("\n\n")}`).join("\n\n"))
  writeFileSync(resolve(directory, "bilingual.html"), toBilingualHtml(result))
  return result
}
export function readTranslation(root: string, paperId: string): TranslationResult { return JSON.parse(readFileSync(resolve(root, ".researchos", "translations", safe(paperId), "translation.json"), "utf8")) as TranslationResult }
function safe(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, "-") }
