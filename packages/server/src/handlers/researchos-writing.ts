import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import { readSource, writeSource } from "@researchos/latex"
import { applyHunks, bibtexFromLibrary, convertCsvToLatex, convertMdToLatex, hunksFromRewrite, mergeBibtex, wordDiff, WritingStore } from "@researchos/writing"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosWritingHandler = HttpApiBuilder.group(Api, "server.researchos-writing", (handlers) =>
  handlers
    .handle("writing.tableToLatex", ({ payload }) => response(withRoot(async () => ({
      text: convertCsvToLatex({
        csv: payload.csv,
        ...(payload.caption ? { caption: payload.caption } : {}),
        ...(payload.label ? { label: payload.label } : {}),
      }),
    }))))
    .handle("writing.mdToLatex", ({ payload }) => response(withRoot(async () => ({ text: convertMdToLatex(payload.markdown) }))))
    .handle("writing.diff", ({ payload }) => response(withRoot(async () => ({
      parts: wordDiff(payload.original, payload.revised),
      hunks: hunksFromRewrite(payload.original, payload.revised),
    }))))
    .handle("writing.applyDiff", ({ payload }) => response(withRoot(async () => ({
      text: applyHunks(payload.original, payload.revised, new Set(payload.accepted)),
    }))))
    .handle("writing.bibtexFromLibrary", ({ payload }) => response(withRoot(async (root) => bibtexFromLibrary(root, [...payload.paperIds]))))
    .handle("writing.bibtexUpsert", ({ payload }) => response(withRoot(async (root) => {
      const source = readSource(root, payload.bibFile)
      const merged = mergeBibtex(source.content, payload.entries.map((entry) => ({ key: entry.key, bibtex: entry.bibtex })))
      await writeSource(root, payload.bibFile, merged.content)
      return { inserted: merged.inserted, skipped: merged.skipped }
    })))
    .handle("writing.suggestionRecord", ({ payload }) => response(withRoot(async (root) => {
      const store = new WritingStore(root)
      const result = store.recordSuggestion(payload)
      store.close()
      return result
    })))
    .handle("writing.suggestions", ({ query }) => response(withRoot(async (root) => {
      const store = new WritingStore(root)
      const suggestions = store.listSuggestions(query.kind, query.limit ?? 50)
      store.close()
      return { suggestions }
    }))),
)

function withRoot<T>(run: (root: string) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return yield* Effect.tryPromise({
      try: async () => run(location.directory),
      catch: (error) => {
        if (error instanceof InvalidRequestError) return error
        return new UnknownError({
          message: error instanceof Error ? error.message : String(error),
          ref: "researchos-writing",
        })
      },
    })
  })
}
