import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const AssetFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({ identifier: "AssetFile" })

const WriteAssetPayload = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({ identifier: "WriteAssetPayload" })

const ConfigPatchPayload = Schema.Struct({
  key: Schema.String,
  value: Schema.Unknown,
}).annotate({ identifier: "ConfigPatchPayload" })

const PresetInstallPayload = Schema.Struct({
  packages: Schema.Array(Schema.String),
}).annotate({ identifier: "PresetInstallPayload" })

const PathQuery = Schema.Struct({
  path: Schema.String,
})

export const ResearchosAssetsGroup = HttpApiGroup.make("server.researchos-assets")
  .add(
    HttpApiEndpoint.get("asset.fileRead", "/api/asset/file", {
      query: PathQuery,
      success: Location.response(AssetFile),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.asset.fileRead",
        summary: "Read asset file",
        description: "Read a ResearchOS asset file (SKILL.md, agent markdown, AGENTS.md, etc.).",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("asset.fileWrite", "/api/asset/file", {
      query: LocationQuery,
      payload: WriteAssetPayload,
      success: Location.response(AssetFile),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.fileWrite",
          summary: "Write asset file",
          description: "Write a ResearchOS asset file. Creates parent directories if needed.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("asset.configPatch", "/api/asset/config", {
      query: LocationQuery,
      payload: ConfigPatchPayload,
      success: Location.response(Schema.Struct({ ok: Schema.Boolean })),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.configPatch",
          summary: "Patch opencode config",
          description: "Patch a key in opencode.json.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("asset.presetInstall", "/api/asset/preset/install", {
      query: LocationQuery,
      payload: PresetInstallPayload,
      success: Location.response(Schema.Struct({ installed: Schema.Array(Schema.String) })),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.asset.presetInstall",
          summary: "Install preset assets",
          description: "Install ResearchOS preset packages into the project .opencode/ directory.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "researchos-assets",
      description: "ResearchOS Asset Management Center.",
    }),
  )
