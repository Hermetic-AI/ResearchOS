import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosWritingHandler = HttpApiBuilder.group(Api, "server.researchos-writing", (handlers) =>
  handlers
    .handle("writing.rewrite", ({ payload }) => response(Effect.succeed({ text: payload.text })))
    .handle("writing.tableToLatex", ({ payload }) => response(Effect.succeed({ text: `table:${payload.csv.substring(0, 20)}` })))
    .handle("writing.mdToLatex", ({ payload }) => response(Effect.succeed({ text: payload.md })))
    .handle("writing.codeToAlgo", ({ payload }) => response(Effect.succeed({ text: `algo:${payload.code.substring(0, 20)}` }))),
)
