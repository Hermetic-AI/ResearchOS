import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { Location } from "@opencode/schema/location"
import { InvalidRequestError, UnknownError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

const NodeType = Schema.Literals(["paper", "note", "concept", "repo"])
const EdgeRelation = Schema.Literals(["cites", "mentions", "implements", "evolves"])

const GraphNode = Schema.Struct({
  id: Schema.String,
  type: NodeType,
  label: Schema.String,
  refId: Schema.optional(Schema.String),
  sourcePath: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosGraphNode" })

const GraphEdge = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  relation: EdgeRelation,
  context: Schema.optional(Schema.String),
  sourcePath: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosGraphEdge" })

const Subgraph = Schema.Struct({
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
}).annotate({ identifier: "ResearchosSubgraph" })

const PaperMeta = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  doi: Schema.optional(Schema.String),
  authors: Schema.Array(Schema.String),
  citationCount: Schema.Number,
}).annotate({ identifier: "ResearchosGraphPaperMeta" })

const NodeDetail = Schema.Struct({
  node: GraphNode,
  neighbors: Subgraph,
  paper: Schema.optional(PaperMeta),
}).annotate({ identifier: "ResearchosGraphNodeDetail" })

const AskPayload = Schema.Struct({
  question: Schema.String,
  center_node: Schema.optional(Schema.String),
  depth: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosGraphAskPayload" })

const Source = Schema.Struct({
  id: Schema.String,
  type: NodeType,
  label: Schema.String,
  refId: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosGraphSource" })

const AskResult = Schema.Struct({
  subgraph: Subgraph,
  contextPack: Schema.String,
  seeds: Schema.Array(GraphNode),
  sources: Schema.Array(Source),
  degraded: Schema.Boolean,
  // 回答由调用方基于 contextPack 生成（graph SubAgent / 前端 RAG 条背后的会话），后端不伪造
  answer: Schema.String,
}).annotate({ identifier: "ResearchosGraphAskResult" })

const LayoutPayload = Schema.Struct({
  positions: Schema.Array(Schema.Struct({
    id: Schema.String,
    x: Schema.Number,
    y: Schema.Number,
  })),
}).annotate({ identifier: "ResearchosGraphLayoutPayload" })

const ReindexResult = Schema.Struct({
  files: Schema.Array(Schema.String),
  nodes: Schema.Number,
  edges: Schema.Number,
}).annotate({ identifier: "ResearchosGraphReindexResult" })

const GraphStatus = Schema.Struct({
  backend: Schema.Literals(["sqlite", "neo4j", "memgraph", "tugraph"]),
  healthy: Schema.Boolean,
  detail: Schema.String,
}).annotate({ identifier: "ResearchosGraphStatus" })

export const ResearchosGraphGroup = HttpApiGroup.make("server.researchos-graph")
  .add(
    HttpApiEndpoint.get("graph.status", "/api/graph/status", {
      query: LocationQuery,
      success: Location.response(GraphStatus),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.graph.status", summary: "Get graph backend health" })),
  )
  .add(
    HttpApiEndpoint.get("graph.get", "/api/graph", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        type: Schema.optional(NodeType),
      }),
      success: Location.response(Subgraph),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.graph.get",
        summary: "Get graph nodes (with persisted x/y) and edges",
      })),
  )
  .add(
    HttpApiEndpoint.get("graph.node", "/api/graph/node", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        id: Schema.String,
      }),
      success: Location.response(NodeDetail),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.graph.node",
        summary: "Get node detail, one-hop neighbors, and linked literature metadata",
      })),
  )
  .add(
    HttpApiEndpoint.post("graph.ask", "/api/graph/ask", {
      query: LocationQuery,
      payload: AskPayload,
      success: Location.response(AskResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.graph.ask",
        summary: "Graph RAG: recall + k-hop expansion + context pack",
        description: "Returns the expanded subgraph, context pack, seeds, and sources. The answer field is empty by design: the caller generates the answer from contextPack.",
      })),
  )
  .add(
    HttpApiEndpoint.post("graph.reindex", "/api/graph/reindex", {
      query: LocationQuery,
      success: Location.response(ReindexResult),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.graph.reindex",
        summary: "Index project Markdown and LaTex files into the knowledge graph",
      })),
  )
  .add(
    HttpApiEndpoint.post("graph.save_layout", "/api/graph/layout", {
      query: LocationQuery,
      payload: LayoutPayload,
      success: Location.response(Schema.Struct({ ok: Schema.Boolean })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.graph.save_layout",
        summary: "Persist frontend-dragged node coordinates",
      })),
  )
  .annotateMerge(OpenApi.annotations({
    title: "researchos-graph",
    description: "ResearchOS project-local knowledge graph.",
  }))
