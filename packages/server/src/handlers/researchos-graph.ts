import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosGraphHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-graph",
  (handlers) =>
    handlers
      .handle("graph.parse", () =>
        response(Effect.succeed({ nodes: [], edges: [] })),
      )
      .handle("graph.upsert", () =>
        response(Effect.succeed({ ok: true })),
      )
      .handle("graph.getAll", () =>
        response(Effect.succeed({ nodes: [], edges: [] })),
      )
      .handle("graph.query", ({ query }) =>
        response(Effect.succeed({
          subgraph: { nodes: [], edges: [] },
          answer: `Graph query stub for: ${query.q}`,
        })),
      ),
)
