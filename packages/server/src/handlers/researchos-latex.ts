import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosLatexHandler = HttpApiBuilder.group(Api, "server.researchos-latex", (handlers) =>
  handlers
    .handle("latex.compile", () => response(Effect.succeed({ ok: true, log: "stub", errors: [] })))
    .handle("latex.formatCheck", () => response(Effect.succeed({ issues: [] }))),
)
