import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode/schema/location"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const AssetScope = Schema.Literals(["project", "global"])
const AssetKind = Schema.Literals(["skill", "agent", "command", "rules"])

const AssetChainEntry = Schema.Struct({
  path: Schema.String,
  exists: Schema.Boolean,
}).annotate({ identifier: "AssetChainEntry" })

const ReadAssetPayload = Schema.Struct({
  kind: Schema.Literal("rules"),
  scope: AssetScope,
}).annotate({ identifier: "ReadAssetPayload" })

const WriteAssetPayload = Schema.Struct({
  kind: AssetKind,
  name: Schema.String,
  content: Schema.String,
  scope: AssetScope,
}).annotate({ identifier: "WriteAssetPayload" })

const NoteWritePayload = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({ identifier: "NoteWritePayload" })

const PresetInstallPayload = Schema.Struct({
  pack: Schema.Literals(["researchos-skills", "researchos-agents", "researchos-mcp"]),
  target: AssetScope,
}).annotate({ identifier: "PresetInstallPayload" })

const ApiDescriptor = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  baseUrl: Schema.String,
  auth: Schema.Literals(["none", "api_key", "bearer", "mailto"]),
  rps: Schema.Number,
  burst: Schema.Number,
  cacheTtlS: Schema.Number,
  enabled: Schema.Boolean,
}).annotate({ identifier: "ResearchosApiDescriptor" })

const ApiStatus = Schema.Struct({
  name: Schema.String,
  healthy: Schema.Boolean,
  state: Schema.Literals(["idle", "healthy", "failed", "disabled"]),
  lastError: Schema.optional(Schema.String),
  lastCallAt: Schema.optional(Schema.Number),
  callsTotal: Schema.Number,
  cacheHitRate: Schema.Number,
  availableTokens: Schema.Number,
}).annotate({ identifier: "ResearchosApiStatus" })

export const ResearchosAssetsGroup = HttpApiGroup.make("server.researchos-assets")
  .add(
    HttpApiEndpoint.post("asset.fileRead", "/api/researchos-assets/file/read", {
      query: LocationQuery,
      payload: ReadAssetPayload,
      success: Location.response(
        Schema.Struct({
          path: Schema.String,
          content: Schema.String,
          chain: Schema.Array(AssetChainEntry),
        }),
      ),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.fileRead",
          summary: "Read project rules",
          description: "Read the effective project or global AGENTS.md and return its load chain.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("api.list", "/api/researchos-assets/api", {
      query: LocationQuery,
      success: Location.response(Schema.Array(ApiDescriptor)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.asset.api.list",
        summary: "List managed academic APIs",
      })),
  )
  .add(
    HttpApiEndpoint.get("api.stats", "/api/researchos-assets/api/stats", {
      query: LocationQuery,
      success: Location.response(Schema.Array(ApiStatus)),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.asset.api.stats",
        summary: "Read API Hub process statistics",
      })),
  )
  .add(
    HttpApiEndpoint.post("api.test", "/api/researchos-assets/api/test", {
      query: LocationQuery,
      payload: Schema.Struct({ name: Schema.String }),
      success: Location.response(Schema.Struct({
        ok: Schema.Boolean,
        latencyMs: Schema.Number,
        error: Schema.optional(Schema.String),
      })),
      error: [UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({
        identifier: "v2.asset.api.test",
        summary: "Test an API Hub adapter connection",
      })),
  )
  .add(
    HttpApiEndpoint.post("asset.fileWrite", "/api/researchos-assets/file/write", {
      query: LocationQuery,
      payload: WriteAssetPayload,
      success: Location.response(
        Schema.Struct({
          path: Schema.String,
          reloaded: Schema.Boolean,
        }),
      ),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.fileWrite",
          summary: "Write an asset file",
          description: "Atomically write a Skill, SubAgent, Command, or Rules file in project or global scope.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("asset.noteWrite", "/api/researchos-assets/note/write", {
      query: LocationQuery,
      payload: NoteWritePayload,
      success: Location.response(Schema.Struct({ path: Schema.String })),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.noteWrite",
          summary: "Write a project note file",
          description: "Write a Markdown note under notes/ in the project root. Parent directories are created automatically.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("asset.presetInstall", "/api/researchos-assets/preset/install", {
      query: LocationQuery,
      payload: PresetInstallPayload,
      success: Location.response(
        Schema.Struct({
          installed: Schema.Array(Schema.String),
          configPatched: Schema.Array(Schema.String),
        }),
      ),
      error: [InvalidRequestError, UnknownError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.presetInstall",
          summary: "Install ResearchOS preset assets",
          description: "Install ResearchOS Skills, SubAgents, or MCP templates into the selected scope.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "researchos-assets",
      description: "ResearchOS file-backed asset management endpoints.",
    }),
  )
