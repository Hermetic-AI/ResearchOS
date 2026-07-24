import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const ChartR = Schema.Struct({ chartId: Schema.String, artifactPath: Schema.String, previewSvg: Schema.String })
const TextR = Schema.Struct({ text: Schema.String })

export const ResearchosPlotGroup = HttpApiGroup.make("server.researchos-plot")
  .add(HttpApiEndpoint.post("plot.create", "/api/plot/create", { query: LocationQuery, payload: Schema.Struct({ template: Schema.String, dataFile: Schema.optional(Schema.String), theme: Schema.optional(Schema.String) }), success: Location.response(ChartR) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.create" })))
  .add(HttpApiEndpoint.post("plot.mermaid", "/api/plot/mermaid", { query: LocationQuery, payload: Schema.Struct({ source: Schema.String }), success: Location.response(TextR) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.mermaid" })))
  .add(HttpApiEndpoint.post("plot.graphviz", "/api/plot/graphviz", { query: LocationQuery, payload: Schema.Struct({ source: Schema.String }), success: Location.response(TextR) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.graphviz" })))
  .add(HttpApiEndpoint.post("plot.insertToPaper", "/api/plot/insert", { query: LocationQuery, payload: Schema.Struct({ chartId: Schema.String, section: Schema.String }), success: Location.response(TextR) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.insert" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-plot" }))
