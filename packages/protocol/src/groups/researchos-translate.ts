import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, UnknownError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"
const Result = Schema.Struct({ paperId: Schema.String, sections: Schema.Array(Schema.Struct({ type: Schema.String, title: Schema.String, original: Schema.Array(Schema.String), translated: Schema.Array(Schema.String) })), glossary: Schema.Array(Schema.Struct({ en: Schema.String, zh: Schema.String, domain: Schema.optional(Schema.String) })) })
const errors = [InvalidRequestError, UnknownError]
export const ResearchosTranslateGroup = HttpApiGroup.make("server.researchos-translate")
  .add(HttpApiEndpoint.post("translate.run", "/api/translate/run", { query: LocationQuery, payload: Schema.Struct({ paperId: Schema.String, sections: Schema.optional(Schema.Array(Schema.String)), engine: Schema.optional(Schema.Literals(["auto", "api", "llm"])) }), success: Location.response(Result), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("translate.get", "/api/translate/:paperId", { params: { paperId: Schema.String }, query: LocationQuery, success: Location.response(Result), error: errors }).annotateMerge(locationQueryOpenApi))
  .annotateMerge(OpenApi.annotations({ title: "researchos-translate", description: "Archived PDF extraction and configured academic translation." }))
