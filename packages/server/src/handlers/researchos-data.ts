import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosDataHandler = HttpApiBuilder.group(Api, "server.researchos-data", (h) =>
  h
    .handle("data.profile", ({ query }) => response(Effect.succeed({ file: query.file, rows: 0, columns: 0, schema: [] })))
    .handle("data.statTest", ({ payload }) => response(Effect.succeed({ test: payload.test, statistic: 0, pValue: 1, conclusion: "stub" }))),
)
