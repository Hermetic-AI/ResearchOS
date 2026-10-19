import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { Location } from "@opencode/schema/location"
import { InvalidRequestError, UnknownError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const Theme = Schema.Literals(["nature", "science", "ieee", "prism"])
const Template = Schema.Literals(["grouped_bar", "scatter_regression", "boxplot", "violin", "survival", "heatmap"])
const Data = Schema.Union([
  Schema.Struct({ file: Schema.String }),
  Schema.Struct({ inline: Schema.Array(JsonObject) }),
])

const ChartResult = Schema.Struct({
  chartId: Schema.String,
  artifactPath: Schema.String,
  previewSvg: Schema.String,
}).annotate({ identifier: "ResearchosPlotChartResult" })

const TuneResult = Schema.Struct({
  chartId: Schema.String,
  artifactPath: Schema.String,
  previewSvg: Schema.String,
  code: Schema.String,
  codePriority: Schema.Boolean,
}).annotate({ identifier: "ResearchosPlotTuneResult" })

const SignificanceResult = Schema.Struct({
  chartId: Schema.String,
  artifactPath: Schema.String,
  previewSvg: Schema.String,
  pValues: Schema.Array(Schema.Struct({
    groups: Schema.Tuple([Schema.String, Schema.String]),
    pValue: Schema.Number,
    stars: Schema.Literals(["*", "**", "***", "ns"]),
  })),
}).annotate({ identifier: "ResearchosPlotSignificanceResult" })

const DiagramArtifact = Schema.Struct({
  artifactId: Schema.String,
  artifactPath: Schema.String,
  code: Schema.optional(Schema.String),
  svg: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosPlotDiagramArtifact" })

const Artifact = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  chartId: Schema.optional(Schema.String),
  path: Schema.String,
  previewSvg: Schema.optional(Schema.String),
  texFile: Schema.optional(Schema.String),
  texLabel: Schema.optional(Schema.String),
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosPlotArtifact" })

const errors = [InvalidRequestError, UnknownError]

export const ResearchosPlotGroup = HttpApiGroup.make("server.researchos-plot")
  .add(HttpApiEndpoint.post("plot.create", "/api/plot/charts", {
    query: LocationQuery,
    payload: Schema.Struct({
      template: Template,
      data: Data,
      theme: Schema.optional(Theme),
      spec: Schema.optional(JsonObject),
    }),
    success: Location.response(ChartResult),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.create" })))
  .add(HttpApiEndpoint.post("plot.tune", "/api/plot/charts/:id/tune", {
    params: { id: Schema.String },
    query: LocationQuery,
    payload: Schema.Struct({ patch: JsonObject }),
    success: Location.response(TuneResult),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.tune" })))
  .add(HttpApiEndpoint.post("plot.annotateSignificance", "/api/plot/charts/:id/significance", {
    params: { id: Schema.String },
    query: LocationQuery,
    payload: Schema.Struct({
      test: Schema.Literals(["ttest", "anova", "mannwhitneyu"]),
      groups: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    }),
    success: Location.response(SignificanceResult),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.annotateSignificance" })))
  .add(HttpApiEndpoint.post("plot.mermaid", "/api/plot/mermaid", {
    query: LocationQuery,
    payload: Schema.Struct({ code: Schema.String, name: Schema.optional(Schema.String), theme: Schema.optional(Schema.String) }),
    success: Location.response(DiagramArtifact),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.mermaid" })))
  .add(HttpApiEndpoint.post("plot.graphviz", "/api/plot/graphviz", {
    query: LocationQuery,
    payload: Schema.Struct({
      dot: Schema.String,
      engine: Schema.optional(Schema.Literals(["dot", "neato", "fdp"])),
      name: Schema.optional(Schema.String),
    }),
    success: Location.response(DiagramArtifact),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.graphviz" })))
  .add(HttpApiEndpoint.post("plot.diagram", "/api/plot/diagram", {
    query: LocationQuery,
    payload: Schema.Struct({
      action: Schema.Literals(["create", "open"]),
      file: Schema.optional(Schema.String),
      stencilPack: Schema.optional(Schema.Literals(["nn_layers", "agent", "flow"])),
    }),
    success: Location.response(Schema.Struct({ file: Schema.String })),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.diagram" })))
  .add(HttpApiEndpoint.post("plot.diagramSave", "/api/plot/diagram/save", {
    query: LocationQuery,
    payload: Schema.Struct({ file: Schema.String, xml: Schema.String }),
    success: Location.response(Schema.Struct({ file: Schema.String })),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.diagramSave" })))
  .add(HttpApiEndpoint.post("plot.insertToPaper", "/api/plot/insert", {
    query: LocationQuery,
    payload: Schema.Struct({
      artifactPath: Schema.String,
      texFile: Schema.String,
      section: Schema.optional(Schema.String),
      caption: Schema.String,
      label: Schema.optional(Schema.String),
    }),
    success: Location.response(Schema.Struct({ ok: Schema.Literal(true), latexSnippet: Schema.String })),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.insert" })))
  .add(HttpApiEndpoint.get("plot.artifacts", "/api/plot/artifacts", {
    query: LocationQuery,
    success: Location.response(Schema.Array(Artifact)),
    error: [UnknownError],
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.artifacts" })))
  .add(HttpApiEndpoint.get("plot.artifactFile", "/api/plot/artifacts/:id/file", {
    params: { id: Schema.String },
    query: LocationQuery,
    success: Location.response(Schema.Struct({
      format: Schema.String,
      content: Schema.String,
      encoding: Schema.Literals(["utf8", "base64"]),
    })),
    error: errors,
  }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.plot.artifactFile" })))
  .annotateMerge(OpenApi.annotations({
    title: "researchos-plot",
    description: "Publication chart execution, diagram artifacts, and paper insertion.",
  }))
