import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode/schema/location"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const LatexError = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  message: Schema.String,
  severity: Schema.Literals(["error", "warning"]),
}).annotate({ identifier: "ResearchosLatexError" })

const CompileResult = Schema.Struct({
  available: Schema.Literal(true),
  ok: Schema.Boolean,
  pdfPath: Schema.optional(Schema.String),
  log: Schema.String,
  errors: Schema.Array(LatexError),
  durationMs: Schema.Number,
}).annotate({ identifier: "ResearchosLatexCompileResult" })

const CompileUnavailable = Schema.Struct({
  available: Schema.Literal(false),
  message: Schema.String,
  installHint: Schema.String,
}).annotate({ identifier: "ResearchosLatexCompileUnavailable" })

const CompileResponse = Schema.Union([CompileResult, CompileUnavailable]).annotate({
  identifier: "ResearchosLatexCompileResponse",
})

const SynctexResult = Schema.Struct({
  found: Schema.Boolean,
  reason: Schema.optional(Schema.String),
  file: Schema.optional(Schema.String),
  line: Schema.optional(Schema.Number),
  page: Schema.optional(Schema.Number),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosLatexSynctexResult" })

const FormatIssue = Schema.Struct({
  file: Schema.String,
  line: Schema.Number,
  rule: Schema.String,
  severity: Schema.Literals(["error", "warning", "info"]),
  message: Schema.String,
}).annotate({ identifier: "ResearchosLatexFormatIssue" })

const OutlineItem = Schema.Struct({
  level: Schema.Number,
  title: Schema.String,
  line: Schema.Number,
}).annotate({ identifier: "ResearchosLatexOutlineItem" })

const BibtexEntry = Schema.Struct({
  type: Schema.String,
  key: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
}).annotate({ identifier: "ResearchosLatexBibtexEntry" })

const BuildRecord = Schema.Struct({
  id: Schema.String,
  mainFile: Schema.String,
  status: Schema.Literals(["success", "failed", "unavailable"]),
  pdfPath: Schema.optional(Schema.String),
  log: Schema.String,
  durationMs: Schema.optional(Schema.Number),
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosLatexBuildRecord" })

export const ResearchosLatexGroup = HttpApiGroup.make("server.researchos-latex")
  .add(
    HttpApiEndpoint.get("latex.files", "/api/latex/files", {
      query: LocationQuery,
      success: Location.response(Schema.Struct({ files: Schema.Array(Schema.String) })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.latex.files", summary: "List project LaTeX and BibTeX sources" })),
  )
  .add(
    HttpApiEndpoint.get("latex.source", "/api/latex/source", {
      query: Schema.Struct({ ...LocationQuery.fields, file: Schema.String }),
      success: Location.response(Schema.Struct({
        file: Schema.String,
        content: Schema.String,
        outline: Schema.Array(OutlineItem),
        bibliography: Schema.Array(BibtexEntry),
      })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.latex.source", summary: "Read a project LaTeX or BibTeX source" })),
  )
  .add(
    HttpApiEndpoint.post("latex.sourceWrite", "/api/latex/source", {
      query: LocationQuery,
      payload: Schema.Struct({ file: Schema.String, content: Schema.String }),
      success: Location.response(Schema.Struct({ file: Schema.String, bytes: Schema.Number })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.latex.source_write", summary: "Atomically write a project LaTeX or BibTeX source" })),
  )
  .add(
    HttpApiEndpoint.get("latex.pdf", "/api/latex/pdf", {
      query: Schema.Struct({ ...LocationQuery.fields, mainFile: Schema.String }),
      success: Location.response(Schema.Struct({ file: Schema.String, data: Schema.String })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.latex.pdf", summary: "Read the latest compiled PDF as base64" })),
  )
  .add(
    HttpApiEndpoint.get("latex.builds", "/api/latex/builds", {
      query: Schema.Struct({ ...LocationQuery.fields, limit: Schema.optional(Schema.NumberFromString) }),
      success: Location.response(Schema.Struct({ builds: Schema.Array(BuildRecord) })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.latex.builds", summary: "List recent LaTeX builds" })),
  )
  .add(
    HttpApiEndpoint.post("latex.compile", "/api/latex/compile", {
      query: LocationQuery,
      payload: Schema.Struct({ mainFile: Schema.String }).annotate({ identifier: "ResearchosLatexCompilePayload" }),
      success: Location.response(CompileResponse),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.latex.compile",
        summary: "Compile a LaTeX main file with Tectonic",
        description: "Returns structured diagnostics and the PDF path, or an honest unavailable state when Tectonic is not installed.",
      })),
  )
  .add(
    HttpApiEndpoint.get("latex.synctex", "/api/latex/synctex", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        mainFile: Schema.optional(Schema.String),
        file: Schema.optional(Schema.String),
        line: Schema.optional(Schema.NumberFromString),
        pdfPath: Schema.optional(Schema.String),
        page: Schema.optional(Schema.NumberFromString),
        x: Schema.optional(Schema.NumberFromString),
        y: Schema.optional(Schema.NumberFromString),
      }),
      success: Location.response(SynctexResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.latex.synctex",
        summary: "SyncTeX forward (file/line → PDF position) and inverse (PDF coordinates → source) lookup",
      })),
  )
  .add(
    HttpApiEndpoint.post("latex.format_check", "/api/latex/format-check", {
      query: LocationQuery,
      payload: Schema.Struct({
        mainFile: Schema.String,
        template: Schema.optional(Schema.Literals(["ieee", "acm"])),
      }).annotate({ identifier: "ResearchosLatexFormatCheckPayload" }),
      success: Location.response(Schema.Struct({ issues: Schema.Array(FormatIssue) })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.latex.format_check",
        summary: "Run LaTeX format and template compliance checks",
      })),
  )
  .annotateMerge(OpenApi.annotations({
    title: "researchos-latex",
    description: "ResearchOS local LaTeX toolchain.",
  }))
