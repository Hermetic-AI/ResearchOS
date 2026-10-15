import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const Dataset = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  format: Schema.String,
  sizeBytes: Schema.Number,
  profileJson: Schema.optional(Schema.String),
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosDataDataset" })

const Artifact = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  path: Schema.String,
  previewPath: Schema.optional(Schema.String),
  format: Schema.String,
  dpi: Schema.optional(Schema.Number),
  latexSnippet: Schema.optional(Schema.String),
  specJson: Schema.optional(Schema.String),
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosDataArtifact" })

const ArtifactLink = Schema.Struct({
  artifactId: Schema.String,
  gitCommit: Schema.optional(Schema.String),
  texFile: Schema.optional(Schema.String),
  texSection: Schema.optional(Schema.String),
  linkedAt: Schema.Number,
}).annotate({ identifier: "ResearchosDataArtifactLink" })

const ArtifactDetail = Schema.Struct({
  artifact: Artifact,
  links: Schema.Array(ArtifactLink),
}).annotate({ identifier: "ResearchosDataArtifactDetail" })

const ArtifactFile = Schema.Struct({
  format: Schema.String,
  content: Schema.String,
  encoding: Schema.Literals(["utf8", "base64"]),
}).annotate({ identifier: "ResearchosDataArtifactFile" })

const StatTest = Schema.Struct({
  id: Schema.String,
  test: Schema.String,
  columnsJson: Schema.String,
  statistic: Schema.optional(Schema.Number),
  pValue: Schema.optional(Schema.Number),
  conclusion: Schema.String,
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosDataStatTest" })

const LinkPayload = Schema.Struct({
  commit: Schema.optional(Schema.String),
  texFile: Schema.optional(Schema.String),
  texSection: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosDataLinkPayload" })

const LinkResult = Schema.Struct({
  ok: Schema.Literal(true),
  warning: Schema.optional(Schema.String),
}).annotate({ identifier: "ResearchosDataLinkResult" })

const Notebook = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.Number,
}).annotate({ identifier: "ResearchosDataNotebook" })

const Cell = Schema.Struct({
  id: Schema.String,
  notebookId: Schema.String,
  position: Schema.Number,
  source: Schema.String,
  status: Schema.Literals(["idle", "running", "success", "error"]),
  stdout: Schema.optional(Schema.String),
  stderr: Schema.optional(Schema.String),
  durationMs: Schema.optional(Schema.Number),
  executedAt: Schema.optional(Schema.Number),
}).annotate({ identifier: "ResearchosDataCell" })

const RunError = Schema.Struct({
  type: Schema.String,
  message: Schema.String,
  traceback: Schema.String,
}).annotate({ identifier: "ResearchosDataRunError" })

export const ResearchosDataGroup = HttpApiGroup.make("server.researchos-data")
  .add(
    HttpApiEndpoint.get("data.notebooks", "/api/data/notebooks", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Notebook)),
      error: [UnknownError],
    }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.notebooks", summary: "List notebooks, creating the default notebook on first use" })),
  )
  .add(
    HttpApiEndpoint.get("data.cells", "/api/data/notebooks/:id/cells", {
      params: { id: Schema.String },
      query: LocationQuery,
      success: Location.response(Schema.Array(Cell)),
      error: [InvalidRequestError, UnknownError],
    }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.cells", summary: "List persisted notebook cells" })),
  )
  .add(
    HttpApiEndpoint.post("data.cellCreate", "/api/data/notebooks/:id/cells", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: Schema.Struct({ source: Schema.optional(Schema.String) }),
      success: Location.response(Cell),
      error: [InvalidRequestError, UnknownError],
    }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.cell_create", summary: "Append a notebook code cell" })),
  )
  .add(
    HttpApiEndpoint.post("data.cellSave", "/api/data/cells/:id", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: Schema.Struct({ source: Schema.String }),
      success: Location.response(Cell),
      error: [InvalidRequestError, UnknownError],
    }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.cell_save", summary: "Persist notebook cell source" })),
  )
  .add(
    HttpApiEndpoint.post("data.cellRun", "/api/data/cells/:id/run", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: Schema.Struct({ source: Schema.String, workdir: Schema.optional(Schema.String), timeoutS: Schema.optional(Schema.Number) }),
      success: Location.response(Schema.Struct({
        cell: Cell,
        artifacts: Schema.Array(Schema.String),
        error: Schema.optional(RunError),
      })),
      error: [InvalidRequestError, UnknownError],
    }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.cell_run", summary: "Execute a cell in the persistent sandbox kernel" })),
  )
  .add(
    HttpApiEndpoint.get("data.datasets", "/api/data/datasets", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Dataset)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.data.datasets", summary: "List registered datasets" })),
  )
  .add(
    HttpApiEndpoint.get("data.artifacts", "/api/data/artifacts", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Artifact)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.data.artifacts", summary: "List chart/table/report artifacts" })),
  )
  .add(
    HttpApiEndpoint.get("data.artifact", "/api/data/artifacts/:id", {
      params: { id: Schema.String },
      query: LocationQuery,
      success: Location.response(ArtifactDetail),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.data.artifact", summary: "Artifact detail with experiment links" })),
  )
  .add(
    HttpApiEndpoint.get("data.artifactFile", "/api/data/artifacts/:id/file", {
      params: { id: Schema.String },
      query: LocationQuery,
      success: Location.response(ArtifactFile),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.data.artifactFile",
        summary: "Read artifact bytes (utf8 for svg, base64 for pdf/png)",
      })),
  )
  .add(
    HttpApiEndpoint.get("data.statTests", "/api/data/stat-tests", {
      query: LocationQuery,
      success: Location.response(Schema.Array(StatTest)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.data.statTests", summary: "List recorded statistical tests" })),
  )
  .add(
    HttpApiEndpoint.post("data.link", "/api/data/artifacts/:id/link", {
      params: { id: Schema.String },
      query: LocationQuery,
      payload: LinkPayload,
      success: Location.response(LinkResult),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.data.link",
        summary: "Link an artifact to a git commit and a LaTeX section",
      })),
  )
  .add(
    HttpApiEndpoint.post("data.datasetRegister", "/api/data/datasets/register", {
      query: LocationQuery,
      payload: Schema.Struct({
        path: Schema.String,
        name: Schema.optional(Schema.String),
      }),
      success: Location.response(Dataset),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.data.dataset_register",
        summary: "Register a workspace file (CSV/Parquet/JSON) as a dataset",
      })),
  )
  .annotateMerge(OpenApi.annotations({
    title: "researchos-data",
    description: "ResearchOS data analysis artifact store.",
  }))
