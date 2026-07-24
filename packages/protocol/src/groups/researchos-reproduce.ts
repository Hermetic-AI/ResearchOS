import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const ResearchosReproduceGroup = HttpApiGroup.make("server.researchos-reproduce")
  .add(HttpApiEndpoint.post("reproduce.create", "/api/reproduce/create", { query: LocationQuery, payload: Schema.Struct({ paperUrl: Schema.String, repoUrl: Schema.String }), success: Location.response(Schema.Struct({ runId: Schema.String })) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.reproduce.create" })))
  .add(HttpApiEndpoint.get("reproduce.get", "/api/reproduce/run", { query: Schema.Struct({ runId: Schema.String }), success: Location.response(Schema.Struct({ id: Schema.String, status: Schema.String, steps: Schema.Array(Schema.Struct({ step: Schema.String, status: Schema.String, log: Schema.String })) })) }).annotateMerge(OpenApi.annotations({ identifier: "v2.reproduce.get" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-reproduce" }))
