import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosTranslateHandler = HttpApiBuilder.group(Api, "server.researchos-translate", (h) =>
  h.handle("translate.run", ({ payload }) => response(Effect.succeed({ paperId: payload.paperId, sections: [], glossary: [] }))),
)
