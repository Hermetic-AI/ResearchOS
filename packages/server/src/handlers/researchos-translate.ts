import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import { readTranslation, translatePaper } from "@researchos/translate"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"
export const ResearchosTranslateHandler = HttpApiBuilder.group(Api, "server.researchos-translate", (handlers) => handlers
  .handle("translate.run", ({ payload }) => response(withLocation((directory) => translatePaper(directory, { paperId: payload.paperId, ...(payload.sections ? { sections: Array.from(payload.sections) } : {}), ...(payload.engine ? { engine: payload.engine } : {}) }))))
  .handle("translate.get", ({ params }) => response(withLocation((directory) => Promise.resolve(readTranslation(directory, params.paperId))))),
)
function withLocation<T>(run: (directory: string) => Promise<T>) { return Effect.gen(function* () { const location = yield* Location.Service; return yield* Effect.tryPromise({ try: () => run(location.directory), catch: (error) => { const message = error instanceof Error ? error.message : String(error); if (/no archived PDF|not found|no extractable|No translation engine/i.test(message)) return new InvalidRequestError({ message }); return new UnknownError({ message, ref: "researchos-translate" }) } }) }) }
