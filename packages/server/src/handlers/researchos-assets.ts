import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosAssetsHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-assets",
  (handlers) =>
    handlers
      .handle("asset.fileRead", ({ query }) =>
        response(Effect.succeed({
          path: query.path,
          content: `# File content for: ${query.path}\n\n(Asset file read handler - stub)`,
        })),
      )
      .handle("asset.fileWrite", ({ payload }) =>
        response(Effect.succeed({
          path: payload.path,
          content: payload.content,
        })),
      )
      .handle("asset.configPatch", () =>
        response(Effect.succeed({ ok: true })),
      )
      .handle("asset.presetInstall", ({ payload }) =>
        response(Effect.succeed({ installed: payload.packages })),
      ),
)
