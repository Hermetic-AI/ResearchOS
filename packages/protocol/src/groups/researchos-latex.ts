import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const CompilePayload = Schema.Struct({ mainFile: Schema.String, workdir: Schema.optional(Schema.String) })
const CompileResult = Schema.Struct({ ok: Schema.Boolean, pdfPath: Schema.optional(Schema.String), log: Schema.String, errors: Schema.Array(Schema.Struct({ file: Schema.String, line: Schema.Number, message: Schema.String })) })
const CheckPayload = Schema.Struct({ content: Schema.String, template: Schema.optional(Schema.String) })
const CheckResult = Schema.Struct({ issues: Schema.Array(Schema.Struct({ file: Schema.String, line: Schema.Number, rule: Schema.String, message: Schema.String })) })

export const ResearchosLatexGroup = HttpApiGroup.make("server.researchos-latex")
  .add(HttpApiEndpoint.post("latex.compile", "/api/latex/compile", { query: LocationQuery, payload: CompilePayload, success: Location.response(CompileResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.latex.compile" })))
  .add(HttpApiEndpoint.post("latex.formatCheck", "/api/latex/format-check", { query: LocationQuery, payload: CheckPayload, success: Location.response(CheckResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.latex.formatCheck" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-latex" }))
