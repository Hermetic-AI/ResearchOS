import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve, sep } from "path"
import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import { convertCsvToLatex, convertMdToLatex } from "./convert"
import { mergeBibtex } from "./bibtex"
import { bibtexFromLibrary } from "./library"
import { WritingStore } from "./store"
import { SUGGESTION_KINDS, SUGGESTION_STATUSES } from "./types"

export default Plugin.define({
  id: "researchos.writing",
  async setup(ctx) {
    const root = ctx.location.directory
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "table_to_latex",
        description: "Convert a CSV file to a booktabs-style LaTeX table (caption/label optional)",
        input: Schema.Struct({
          file: Schema.String.annotate({ description: "CSV file path, relative to the project root" }),
          caption: Schema.optionalKey(Schema.String),
          label: Schema.optionalKey(Schema.String),
        }),
        execute: async ({ file, caption, label }) => ({
          content: convertCsvToLatex({
            csv: readFileSync(resolveInside(root, file), "utf8"),
            ...(caption ? { caption } : {}),
            ...(label ? { label } : {}),
          }),
        }),
      })

      editor.add({
        name: "md_to_latex",
        description: "Convert a Markdown note to a LaTeX fragment (headings, lists, code, tables)",
        input: Schema.Struct({
          file: Schema.String.annotate({ description: "Markdown file path, relative to the project root" }),
        }),
        execute: async ({ file }) => ({
          content: convertMdToLatex(readFileSync(resolveInside(root, file), "utf8")),
        }),
      })

      editor.add({
        name: "bibtex_upsert",
        description: "Append BibTeX entries into a .bib file, skipping duplicate keys",
        input: Schema.Struct({
          bib_file: Schema.String.annotate({ description: "Target .bib file, relative to the project root" }),
          entries: Schema.Array(Schema.Struct({ key: Schema.String, bibtex: Schema.String })),
        }),
        execute: async ({ bib_file: bibFile, entries }) => {
          const path = resolveInside(root, bibFile)
          const existing = existsSync(path) ? readFileSync(path, "utf8") : ""
          const merged = mergeBibtex(existing, entries)
          writeFileSync(path, merged.content)
          return { content: JSON.stringify({ inserted: merged.inserted, skipped: merged.skipped }) }
        },
      })

      editor.add({
        name: "bibtex_from_library",
        description: "Fetch BibTeX entries for papers from the local literature library (read-only)",
        input: Schema.Struct({
          paper_ids: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
        }),
        execute: async ({ paper_ids: paperIds }) => ({
          content: JSON.stringify(bibtexFromLibrary(root, paperIds)),
        }),
      })

      editor.add({
        name: "suggest_record",
        description: "Persist a writing suggestion and its review outcome",
        input: Schema.Struct({
          kind: Schema.Literals(SUGGESTION_KINDS),
          target_file: Schema.optionalKey(Schema.String),
          input_excerpt: Schema.String,
          output: Schema.String,
          status: Schema.Literals(SUGGESTION_STATUSES),
        }),
        execute: async ({ kind, target_file: targetFile, input_excerpt: inputExcerpt, output, status }) => {
          const store = new WritingStore(root)
          const record = store.recordSuggestion({
            kind,
            ...(targetFile ? { targetFile } : {}),
            inputExcerpt,
            output,
            status,
          })
          store.close()
          return { content: JSON.stringify(record) }
        },
      })
    })
  },
})

function resolveInside(root: string, path: string): string {
  // 与其他模块一致的安全白名单：工具只能读写项目根内文件
  const resolved = resolve(root, path)
  if (!resolved.startsWith(resolve(root) + sep)) throw new Error(`Path escapes project root: ${path}`)
  return resolved
}

export { convertCsvToLatex, convertMdToLatex, escapeLatex, latexTable } from "./convert"
export { wordDiff, splitSentences, hunksFromRewrite, applyHunks } from "./diff"
export { extractBibKeys, mergeBibtex } from "./bibtex"
export { bibtexFromLibrary } from "./library"
export { WritingStore } from "./store"
export * from "./types"
