import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const GraphNodeSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  label: Schema.String,
  refId: Schema.optional(Schema.String),
  x: Schema.Number,
  y: Schema.Number,
})

const GraphEdgeSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  relation: Schema.String,
})

const GraphDataSchema = Schema.Struct({
  nodes: Schema.Array(GraphNodeSchema),
  edges: Schema.Array(GraphEdgeSchema),
})

export const ResearchosGraphGroup = HttpApiGroup.make("server.researchos-graph")
  .add(
    HttpApiEndpoint.post("graph.parse", "/api/graph/parse", {
      query: LocationQuery,
      payload: Schema.Struct({ content: Schema.String, basePath: Schema.String }),
      success: Location.response(GraphDataSchema),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.graph.parse" })),
  )
  .add(
    HttpApiEndpoint.post("graph.upsert", "/api/graph/upsert", {
      query: LocationQuery,
      payload: GraphDataSchema,
      success: Location.response(Schema.Struct({ ok: Schema.Boolean })),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.graph.upsert" })),
  )
  .add(
    HttpApiEndpoint.get("graph.getAll", "/api/graph/all", {
      query: LocationQuery,
      success: Location.response(GraphDataSchema),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.graph.getAll" })),
  )
  .add(
    HttpApiEndpoint.get("graph.query", "/api/graph/query", {
      query: Schema.Struct({ q: Schema.String, nodeId: Schema.optional(Schema.String) }),
      success: Location.response(Schema.Struct({
        subgraph: GraphDataSchema,
        answer: Schema.String,
      })),
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.graph.query" })),
  )
  .annotateMerge(OpenApi.annotations({ title: "researchos-graph" }))
