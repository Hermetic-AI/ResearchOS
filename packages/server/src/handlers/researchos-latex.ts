import { Location } from "@opencode-ai/core/location"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import { compile, formatCheck, LatexStore, listSources, readBuildPdf, readSource, synctexQuery, writeSource } from "@researchos/latex"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosLatexHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-latex",
  (handlers) =>
    handlers
      .handle("latex.files", () => response(withRoot(async (root) => ({ files: await listSources(root) }))))
      .handle("latex.source", ({ query }) => response(withRoot(async (root) => readSource(root, query.file))))
      .handle("latex.sourceWrite", ({ payload }) => response(withRoot((root) => writeSource(root, payload.file, payload.content))))
      .handle("latex.pdf", ({ query }) => response(withRoot(async (root) => readBuildPdf(root, query.mainFile))))
      .handle("latex.builds", ({ query }) => response(withRoot(async (root) => {
        const store = new LatexStore(root)
        const builds = store.listBuilds(query.limit ?? 20).map((build) => ({
          id: build.id,
          mainFile: build.mainFile,
          status: build.status,
          ...(build.pdfPath ? { pdfPath: build.pdfPath } : {}),
          log: build.log,
          ...(build.durationMs === null ? {} : { durationMs: build.durationMs }),
          createdAt: build.createdAt,
        }))
        store.close()
        return { builds }
      })))
      .handle("latex.compile", ({ payload }) => response(withRoot((root) =>
        compile({ projectRoot: root, mainFile: payload.mainFile }).then((result) => {
          const store = new LatexStore(root)
          store.recordBuild(result.available ? {
            mainFile: payload.mainFile,
            status: result.ok ? "success" : "failed",
            ...(result.pdfPath ? { pdfPath: result.pdfPath } : {}),
            log: result.log,
            durationMs: result.durationMs,
          } : {
            mainFile: payload.mainFile,
            status: "unavailable",
            log: `${result.message}\n${result.installHint}`,
          })
          store.close()
          return result
        }),
      )))
      .handle("latex.synctex", ({ query }) => response(withRoot((root) =>
        synctexQuery(root, {
          ...(query.mainFile ? { mainFile: query.mainFile } : {}),
          ...(query.file ? { file: query.file } : {}),
          ...(query.line !== undefined ? { line: query.line } : {}),
          ...(query.pdfPath ? { pdfPath: query.pdfPath } : {}),
          ...(query.page !== undefined ? { page: query.page } : {}),
          ...(query.x !== undefined ? { x: query.x } : {}),
          ...(query.y !== undefined ? { y: query.y } : {}),
        }),
      )))
      .handle("latex.format_check", ({ payload }) => response(withRoot((root) =>
        Promise.resolve(formatCheck({ projectRoot: root, mainFile: payload.mainFile, template: payload.template })).then((result) => {
          const store = new LatexStore(root)
          store.recordFormatIssues(payload.mainFile, result.issues)
          store.close()
          return result
        }),
      ))),
)

function withRoot<T>(run: (root: string) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return yield* Effect.tryPromise({
      try: async () => run(location.directory),
      catch: (error) => {
        if (error instanceof InvalidRequestError) return error
        return new UnknownError({
          message: error instanceof Error ? error.message : String(error),
          ref: "researchos-latex",
        })
      },
    })
  })
}
