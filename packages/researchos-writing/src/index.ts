import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve, sep } from "path"
import { tool, type Plugin, type PluginModule } from "@opencode/plugin"
import { convertCsvToLatex, convertMdToLatex } from "./convert"
import { mergeBibtex } from "./bibtex"
import { bibtexFromLibrary } from "./library"
import { WritingStore } from "./store"
import { SUGGESTION_KINDS, SUGGESTION_STATUSES } from "./types"

export const WritingPlugin: Plugin = async () => ({
  tool: {
    table_to_latex: tool({
      description: "Convert a CSV file to a booktabs-style LaTeX table (caption/label optional)",
      args: {
        file: tool.schema.string().describe("CSV file path, relative to the project root"),
        caption: tool.schema.string().optional(),
        label: tool.schema.string().optional(),
      },
      execute: async (args, context) => {
        const path = resolveInside(context.directory, args.file)
        const latex = convertCsvToLatex({
          csv: readFileSync(path, "utf8"),
          ...(args.caption ? { caption: args.caption } : {}),
          ...(args.label ? { label: args.label } : {}),
        })
        return { title: "table_to_latex", output: latex }
      },
    }),
    md_to_latex: tool({
      description: "Convert a Markdown note to a LaTeX fragment (headings, lists, code, tables)",
      args: { file: tool.schema.string().describe("Markdown file path, relative to the project root") },
      execute: async (args, context) => ({
        title: "md_to_latex",
        output: convertMdToLatex(readFileSync(resolveInside(context.directory, args.file), "utf8")),
      }),
    }),
    bibtex_upsert: tool({
      description: "Append BibTeX entries into a .bib file, skipping duplicate keys",
      args: {
        bib_file: tool.schema.string().describe("Target .bib file, relative to the project root"),
        entries: tool.schema.array(tool.schema.object({ key: tool.schema.string(), bibtex: tool.schema.string() })),
      },
      execute: async (args, context) => {
        const path = resolveInside(context.directory, args.bib_file)
        const existing = existsSync(path) ? readFileSync(path, "utf8") : ""
        const merged = mergeBibtex(existing, args.entries)
        writeFileSync(path, merged.content)
        return { title: "bibtex_upsert", output: JSON.stringify({ inserted: merged.inserted, skipped: merged.skipped }) }
      },
    }),
    bibtex_from_library: tool({
      description: "Fetch BibTeX entries for papers from the local literature library (read-only)",
      args: { paper_ids: tool.schema.array(tool.schema.string()).min(1) },
      execute: async (args, context) => ({
        title: "bibtex_from_library",
        output: JSON.stringify(bibtexFromLibrary(context.directory, args.paper_ids)),
      }),
    }),
    suggest_record: tool({
      description: "Persist a writing suggestion and its review outcome",
      args: {
        kind: tool.schema.enum(SUGGESTION_KINDS),
        target_file: tool.schema.string().optional(),
        input_excerpt: tool.schema.string(),
        output: tool.schema.string(),
        status: tool.schema.enum(SUGGESTION_STATUSES),
      },
      execute: async (args, context) => {
        const store = new WritingStore(context.directory)
        const record = store.recordSuggestion({
          kind: args.kind,
          ...(args.target_file ? { targetFile: args.target_file } : {}),
          inputExcerpt: args.input_excerpt,
          output: args.output,
          status: args.status,
        })
        store.close()
        return { title: "suggest_record", output: JSON.stringify(record) }
      },
    }),
  },
})

function resolveInside(root: string, path: string): string {
  // 与其他模块一致的安全白名单：工具只能读写项目根内文件
  const resolved = resolve(root, path)
  if (!resolved.startsWith(resolve(root) + sep)) throw new Error(`Path escapes project root: ${path}`)
  return resolved
}

export default { id: "researchos-writing", server: WritingPlugin } satisfies PluginModule

export { convertCsvToLatex, convertMdToLatex, escapeLatex, latexTable } from "./convert"
export { wordDiff, splitSentences, hunksFromRewrite, applyHunks } from "./diff"
export { extractBibKeys, mergeBibtex } from "./bibtex"
export { bibtexFromLibrary } from "./library"
export { WritingStore } from "./store"
export * from "./types"
