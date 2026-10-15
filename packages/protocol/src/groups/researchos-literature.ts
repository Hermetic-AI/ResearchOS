import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const Source = Schema.Literals(["arxiv", "semantic_scholar", "crossref", "pubmed", "zotero", "manual"])

const Paper = Schema.Struct({
  id: Schema.String,
  doi: Schema.optional(Schema.String),
  arxivId: Schema.optional(Schema.String),
  title: Schema.String,
  year: Schema.optional(Schema.Number),
  venue: Schema.optional(Schema.String),
  authors: Schema.Array(Schema.Struct({ name: Schema.String })),
  abstract: Schema.optional(Schema.String),
  citationCount: Schema.Number,
  source: Source,
  isRead: Schema.optional(Schema.Boolean),
  isFavorite: Schema.optional(Schema.Boolean),
}).annotate({ identifier: "ResearchosPaper" })

const SearchPayload = Schema.Struct({
  query: Schema.String,
  sources: Schema.optional(Schema.Array(Schema.Literals(["arxiv", "semantic_scholar", "crossref", "pubmed"]))),
  limit: Schema.optional(Schema.Number),
  start: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosLiteratureSearchPayload" })

const ImportPayload = Schema.Struct({
  path: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  zoteroPath: Schema.optional(Schema.String),
  fileName: Schema.optional(Schema.String),
  contentBase64: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosLiteratureImportPayload" })

const ZoteroReport = Schema.Struct({
  imported: Schema.Number,
  skipped: Schema.Number,
  pdfsCopied: Schema.Number,
  warnings: Schema.Array(Schema.String),
}).annotate({ identifier: "ResearchosLiteratureZoteroReport" })

const ImportResult = Schema.Struct({
  paper: Schema.optional(Paper),
  metadataSource: Schema.optional(Schema.Literals(["crossref", "semantic_scholar", "pdf"])),
  references: Schema.optional(Schema.Number),
  zotero: Schema.optional(ZoteroReport),
}).annotate({ identifier: "ResearchosLiteratureImportResult" })

const CitationEntry = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Number),
  doi: Schema.optional(Schema.String),
  source: Schema.Literals(["pdf", "grobid", "semantic_scholar"]),
  inLibrary: Schema.Boolean,
}).annotate({ identifier: "ResearchosLiteratureCitationEntry" })

const SimilarPaper = Schema.Struct({
  ...Paper.fields,
  score: Schema.Number,
}).annotate({ identifier: "ResearchosLiteratureSimilarPaper" })

const SimilarResult = Schema.Struct({
  results: Schema.Array(SimilarPaper),
  degraded: Schema.Boolean,
}).annotate({ identifier: "ResearchosLiteratureSimilarResult" })

const SelectPayload = Schema.Struct({
  paperId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosLiteratureSelectPayload" })

const ReadPayload = Schema.Struct({
  query: Schema.String,
  k: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosLiteratureReadPayload" })

const ReadSection = Schema.Struct({
  section: Schema.optional(Schema.String),
  text: Schema.String,
  score: Schema.Number,
}).annotate({ identifier: "ResearchosLiteratureReadSection" })

const ReadResult = Schema.Struct({
  sections: Schema.Array(ReadSection),
  degraded: Schema.Boolean,
}).annotate({ identifier: "ResearchosLiteratureReadResult" })

export const ResearchosLiteratureGroup = HttpApiGroup.make("server.researchos-literature")
  .add(
    HttpApiEndpoint.post("literature.search", "/api/literature/search", {
      query: LocationQuery,
      payload: SearchPayload,
      success: Location.response(Schema.Array(Paper)),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.search",
        summary: "Search and admit literature",
        description: "Search arXiv, Semantic Scholar, Crossref, and PubMed, then upsert normalized results into the project library.",
      })),
  )
  .add(
    HttpApiEndpoint.get("literature.list", "/api/literature/papers", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        limit: Schema.optional(Schema.NumberFromString),
        offset: Schema.optional(Schema.NumberFromString),
      }),
      success: Location.response(Schema.Array(Paper)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.list",
        summary: "List project papers",
      })),
  )
  .add(
    HttpApiEndpoint.get("literature.get", "/api/literature/papers/:id", {
      params: { id: Schema.String },
      query: LocationQuery,
      success: Location.response(Paper),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.get",
        summary: "Get paper metadata",
      })),
  )
  .add(
    HttpApiEndpoint.get("literature.export", "/api/literature/export", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        paperIds: Schema.String,
        format: Schema.Literals(["bibtex", "ris", "endnote", "json", "markdown"]),
        style: Schema.optional(Schema.Literals(["ieee", "acm", "apa", "nature", "springer"])),
      }),
      success: Location.response(Schema.Struct({ content: Schema.String })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.export",
        summary: "Export project papers",
      })),
  )
  .add(
    HttpApiEndpoint.post("literature.import", "/api/literature/import", {
      query: LocationQuery,
      payload: ImportPayload,
      success: Location.response(ImportResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.import",
        summary: "Import a PDF into the library",
        description: "Import a workspace-local PDF path or an http(s) PDF URL, enrich metadata online, and parse reference edges.",
      })),
  )
  .add(
    HttpApiEndpoint.get("literature.citations", "/api/literature/papers/:id/citations", {
      params: { id: Schema.String },
      query: Schema.Struct({
        ...LocationQuery.fields,
        direction: Schema.Literals(["references", "cited_by"]),
      }),
      success: Location.response(Schema.Array(CitationEntry)),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.citations",
        summary: "Get references or citing papers of a paper",
      })),
  )
  .add(
    HttpApiEndpoint.get("literature.similar", "/api/literature/papers/:id/similar", {
      params: { id: Schema.String },
      query: Schema.Struct({
        ...LocationQuery.fields,
        limit: Schema.optional(Schema.NumberFromString),
      }),
      success: Location.response(SimilarResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.similar",
        summary: "Recommend similar papers",
        description: "Rank library papers by abstract embedding KNN plus co-citation bonus; degraded to keyword overlap when sqlite-vec is unavailable.",
      })),
  )
  .add(
    HttpApiEndpoint.post("literature.read", "/api/literature/papers/:id/read", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: ReadPayload,
      success: Location.response(ReadResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.read",
        summary: "Semantic retrieval over one paper's full text",
        description: "Return the top-k full-text sections matching a query; degraded to keyword overlap when sqlite-vec is unavailable.",
      })),
  )
  .add(
    HttpApiEndpoint.post("literature.update", "/api/literature/papers/:id", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: Schema.Struct({
        isRead: Schema.optional(Schema.Boolean),
        isFavorite: Schema.optional(Schema.Boolean),
      }),
      success: Location.response(Paper),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.update",
        summary: "Update paper flags (read/favorite)",
      })),
  )
  .add(
    HttpApiEndpoint.post("literature.select", "/api/literature/selection", {
      query: LocationQuery,
      payload: SelectPayload,
      success: Location.response(Schema.Struct({ ok: Schema.Boolean })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.literature.select",
        summary: "Report the currently focused paper",
        description: "Write .researchos/selection.json when paperId is present, clear it when absent; observed by the core researchos/selection SystemContext source.",
      })),
  )
  .annotateMerge(OpenApi.annotations({
    title: "researchos-literature",
    description: "ResearchOS project-local literature library.",
  }))
