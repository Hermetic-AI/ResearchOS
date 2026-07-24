import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const ProfileR = Schema.Struct({ file: Schema.String, rows: Schema.Number, columns: Schema.Number, schema: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String, nullable: Schema.Boolean })) })
const StatR = Schema.Struct({ test: Schema.String, statistic: Schema.Number, pValue: Schema.Number, conclusion: Schema.String })

export const ResearchosDataGroup = HttpApiGroup.make("server.researchos-data")
  .add(HttpApiEndpoint.get("data.profile", "/api/data/profile", { query: Schema.Struct({ file: Schema.String }), success: Location.response(ProfileR) }).annotateMerge(OpenApi.annotations({ identifier: "v2.data.profile" })))
  .add(HttpApiEndpoint.post("data.statTest", "/api/data/stat-test", { query: LocationQuery, payload: Schema.Struct({ file: Schema.String, test: Schema.String, columns: Schema.Array(Schema.String) }), success: Location.response(StatR) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.data.statTest" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-data" }))
