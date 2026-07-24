import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const SearchQuery = Schema.Struct({
  query: Schema.String,
  sources: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
})

const SearchResponse = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    doi: Schema.optional(Schema.String),
    arxivId: Schema.optional(Schema.String),
    title: Schema.String,
    year: Schema.optional(Schema.Number),
    venue: Schema.optional(Schema.String),
    authors: Schema.Array(Schema.Struct({ name: Schema.String })),
    abstract: Schema.optional(Schema.String),
    citationCount: Schema.Number,
    source: Schema.String,
  }),
)

const PaperDetail = Schema.Struct({
  id: Schema.String,
  doi: Schema.optional(Schema.String),
  arxivId: Schema.optional(Schema.String),
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  venue: Schema.optional(Schema.String),
  authors: Schema.Array(Schema.Struct({ name: Schema.String })),
  abstract: Schema.optional(Schema.String),
  citationCount: Schema.Number,
  source: Schema.String,
})

const ExportQuery = Schema.Struct({
  paperIds: Schema.String,
  format: Schema.String,
  style: Schema.optional(Schema.String),
})

const ExportResponse = Schema.Struct({
  content: Schema.String,
})

export const ResearchosLiteratureGroup = HttpApiGroup.make("server.researchos-literature")
  .add(
    HttpApiEndpoint.get("literature.search", "/api/literature/search", {
      query: SearchQuery,
      success: Location.response(SearchResponse),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.literature.search",
        summary: "Search literature",
        description: "Search across arXiv, Semantic Scholar, Crossref, and PubMed.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("literature.list", "/api/literature/list", {
      query: LocationQuery,
      success: Location.response(SearchResponse),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.literature.list",
          summary: "List papers",
          description: "List papers in the local literature database.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("literature.get", "/api/literature/paper", {
      query: Schema.Struct({ id: Schema.String }),
      success: Location.response(PaperDetail),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.literature.get",
        summary: "Get paper detail",
        description: "Get detailed metadata for a single paper.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("literature.export", "/api/literature/export", {
      query: ExportQuery,
      success: Location.response(ExportResponse),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.literature.export",
        summary: "Export papers",
        description: "Export papers in bibtex, ris, endnote, json, or markdown format.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "researchos-literature",
      description: "ResearchOS Literature Management Center.",
    }),
  )
