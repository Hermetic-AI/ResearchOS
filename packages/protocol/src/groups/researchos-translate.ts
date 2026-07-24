import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Location } from "@opencode-ai/schema/location"
import { LocationQuery, locationQueryOpenApi } from "./location"

const TranslatePayload = Schema.Struct({ paperId: Schema.String, sections: Schema.optional(Schema.Array(Schema.String)) })
const TranslateResult = Schema.Struct({ paperId: Schema.String, sections: Schema.Array(Schema.Struct({ type: Schema.String, title: Schema.String, original: Schema.Array(Schema.String), translated: Schema.Array(Schema.String) })), glossary: Schema.Array(Schema.Struct({ en: Schema.String, zh: Schema.String })) })

export const ResearchosTranslateGroup = HttpApiGroup.make("server.researchos-translate")
  .add(HttpApiEndpoint.post("translate.run", "/api/translate/run", { query: LocationQuery, payload: TranslatePayload, success: Location.response(TranslateResult) }).annotateMerge(locationQueryOpenApi).annotateMerge(OpenApi.annotations({ identifier: "v2.translate.run" })))
  .annotateMerge(OpenApi.annotations({ title: "researchos-translate" }))
