import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const RewritePayload = Schema.Struct({ text: Schema.String, style: Schema.String })
const TablePayload = Schema.Struct({ csv: Schema.String, caption: Schema.optional(Schema.String), label: Schema.optional(Schema.String) })
const MdPayload = Schema.Struct({ md: Schema.String })
const AlgoPayload = Schema.Struct({ code: Schema.String, func: Schema.optional(Schema.String) })
const TextResult = Schema.Struct({ text: Schema.String })

export const ResearchosWritingGroup = HttpApiGroup.make("server.researchos-writing")
  .add(HttpApiEndpoint.post("writing.rewrite", "/api/writing/rewrite", { query: LocationQuery, payload: RewritePayload, success: Location.response(TextResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.rewrite" })))
  .add(HttpApiEndpoint.post("writing.tableToLatex", "/api/writing/table", { query: LocationQuery, payload: TablePayload, success: Location.response(TextResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.table" })))
  .add(HttpApiEndpoint.post("writing.mdToLatex", "/api/writing/md2latex", { query: LocationQuery, payload: MdPayload, success: Location.response(TextResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.md2latex" })))
  .add(HttpApiEndpoint.post("writing.codeToAlgo", "/api/writing/algo", { query: LocationQuery, payload: AlgoPayload, success: Location.response(TextResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.writing.algo" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-writing" }))
