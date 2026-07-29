import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const SuggestionKind = Schema.Literals(["title", "structure", "rewrite", "algorithm", "table", "md", "cite"])
const SuggestionStatus = Schema.Literals(["pending", "accepted", "rejected", "partial"])
const TextResult = Schema.Struct({ text: Schema.String })

export const ResearchosWritingGroup = HttpApiGroup.make("server.researchos-writing")
  .add(HttpApiEndpoint.post("writing.tableToLatex", "/api/writing/table", {
    query: LocationQuery,
    payload: Schema.Struct({ csv: Schema.String, caption: Schema.optional(Schema.String), label: Schema.optional(Schema.String) }),
    success: Location.response(TextResult),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.table", summary: "Convert inline CSV into a booktabs LaTeX table" })))
  .add(HttpApiEndpoint.post("writing.mdToLatex", "/api/writing/md2latex", {
    query: LocationQuery,
    payload: Schema.Struct({ markdown: Schema.String }),
    success: Location.response(TextResult),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.md2latex", summary: "Convert inline Markdown into a LaTeX fragment" })))
  .add(HttpApiEndpoint.post("writing.diff", "/api/writing/diff", {
    query: LocationQuery,
    payload: Schema.Struct({ original: Schema.String, revised: Schema.String }),
    success: Location.response(Schema.Struct({
      parts: Schema.Array(Schema.Struct({ value: Schema.String, added: Schema.optional(Schema.Boolean), removed: Schema.optional(Schema.Boolean) })),
      hunks: Schema.Array(Schema.Struct({ index: Schema.Number, original: Schema.String, revised: Schema.String })),
    })),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.diff", summary: "Build word and sentence hunks for a rewrite review" })))
  .add(HttpApiEndpoint.post("writing.applyDiff", "/api/writing/diff/apply", {
    query: LocationQuery,
    payload: Schema.Struct({ original: Schema.String, revised: Schema.String, accepted: Schema.Array(Schema.Number) }),
    success: Location.response(TextResult),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.diff_apply", summary: "Apply accepted sentence hunks from a rewrite review" })))
  .add(HttpApiEndpoint.post("writing.bibtexFromLibrary", "/api/writing/bibtex/library", {
    query: LocationQuery,
    payload: Schema.Struct({ paperIds: Schema.Array(Schema.String) }),
    success: Location.response(Schema.Struct({
      entries: Schema.Array(Schema.Struct({ key: Schema.String, bibtex: Schema.String })),
      missing: Schema.Array(Schema.String),
    })),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.bibtex_library", summary: "Resolve BibTeX entries from the local literature library" })))
  .add(HttpApiEndpoint.post("writing.bibtexUpsert", "/api/writing/bibtex/upsert", {
    query: LocationQuery,
    payload: Schema.Struct({
      bibFile: Schema.String,
      entries: Schema.Array(Schema.Struct({ key: Schema.String, bibtex: Schema.String })),
    }),
    success: Location.response(Schema.Struct({ inserted: Schema.Array(Schema.String), skipped: Schema.Array(Schema.String) })),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.bibtex_upsert", summary: "Atomically merge BibTeX entries into a project bibliography" })))
  .add(HttpApiEndpoint.post("writing.suggestionRecord", "/api/writing/suggestions", {
    query: LocationQuery,
    payload: Schema.Struct({
      kind: SuggestionKind,
      targetFile: Schema.optional(Schema.String),
      inputExcerpt: Schema.String,
      output: Schema.String,
      status: SuggestionStatus,
    }),
    success: Location.response(Schema.Struct({ id: Schema.String })),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.suggestion_record", summary: "Persist a reviewed writing suggestion" })))
  .add(HttpApiEndpoint.get("writing.suggestions", "/api/writing/suggestions", {
    query: Schema.Struct({ ...LocationQuery.fields, kind: Schema.optional(SuggestionKind), limit: Schema.optional(Schema.NumberFromString) }),
    success: Location.response(Schema.Struct({ suggestions: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)) })),
    error: [InvalidRequestError, UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.suggestions", summary: "List persisted writing suggestions" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-writing", description: "Deterministic paper-writing transforms, review data, and citations." }))
