import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosReproduceHandler = HttpApiBuilder.group(Api, "server.researchos-reproduce", (h) =>
  h
    .handle("reproduce.create", () => response(Effect.succeed({ runId: "stub-run" })))
    .handle("reproduce.get", ({ query }) => response(Effect.succeed({ id: query.runId, status: "pending", steps: [] }))),
)
