import { Location } from "@opencode-ai/core/location"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import { LiteratureService, type PaperMeta, type SearchResult } from "@researchos/literature"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

const libraries = new Map<string, Promise<LiteratureService>>()

export const ResearchosLiteratureHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-literature",
  (handlers) =>
    handlers
      .handle("literature.search", ({ payload }) => response(withLibrary((library) =>
        library.search(payload.query, {
          sources: payload.sources ? Array.from(payload.sources) : undefined,
          limit: payload.limit,
          start: payload.start,
        }).then((papers) => papers.map(wirePaper)),
      )))
      .handle("literature.list", ({ query }) => response(withLibrary((library) =>
        Promise.resolve(library.list(query.limit, query.offset).map(wirePaper)),
      )))
      .handle("literature.get", ({ params }) => response(withLibrary(async (library) => {
        const paper = library.get(params.id)
        if (!paper) throw new InvalidRequestError({ message: `Unknown paper: ${params.id}` })
        return wirePaper(paper)
      })))
      .handle("literature.export", ({ query }) => response(withLibrary((library) =>
        library.export(
          query.paperIds.split(",").map((id) => id.trim()).filter(Boolean),
          query.format,
          query.style,
        ).then((content) => ({ content })),
      )))
      .handle("literature.import", ({ payload }) => response(withLibrary(async (library) => {
        // zoteroPath 允许在 projectRoot 之外（如 ~/Zotero）：内核只读复制到临时文件后打开，不写入原库
        if (payload.zoteroPath) {
          if (!(await Bun.file(payload.zoteroPath).exists())) {
            throw new InvalidRequestError({ message: `Zotero database not found: ${payload.zoteroPath}` })
          }
          return { zotero: await library.importZotero(payload.zoteroPath) }
        }
        if (!payload.path && !payload.url) {
          throw new InvalidRequestError({ message: "literature.import requires path, url, or zoteroPath" })
        }
        const result = await library.importPdf({ path: payload.path, url: payload.url })
        return {
          paper: wirePaper(result.paper),
          metadataSource: result.metadataSource,
          references: result.references.edges.length,
        }
      })))
      .handle("literature.citations", ({ params, query }) => response(withLibrary((library) =>
        library.getCitations(params.id, query.direction).then((entries) => entries.map((entry) => ({
          id: entry.id,
          ...(entry.title ? { title: entry.title } : {}),
          ...(entry.year ? { year: entry.year } : {}),
          ...(entry.doi ? { doi: entry.doi } : {}),
          source: entry.source,
          inLibrary: entry.inLibrary,
        }))),
      )))
      .handle("literature.similar", ({ params, query }) => response(withLibrary((library) =>
        library.recommendSimilar(params.id, query.limit).then((result) => ({
          degraded: result.degraded,
          results: result.results.map((paper) => ({ ...wirePaper(paper), score: paper.score })),
        })),
      ))),
)

function withLibrary<T>(run: (library: LiteratureService) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const existing = libraries.get(location.directory)
    const library = existing ?? LiteratureService.open(location.directory).catch((error) => {
      libraries.delete(location.directory)
      throw error
    })
    if (!existing) libraries.set(location.directory, library)
    return yield* Effect.tryPromise({
      try: async () => run(await library),
      catch: serverError,
    })
  })
}

function wirePaper(paper: SearchResult | PaperMeta | {
  readonly id: string
  readonly title: string
  readonly year?: number | null
  readonly venue?: string | null
  readonly authors: Array<{ readonly name: string }>
  readonly citationCount: number
  readonly source: PaperMeta["source"]
  readonly isRead?: boolean
  readonly isFavorite?: boolean
}) {
  return {
    id: paper.id,
    ...("doi" in paper && paper.doi ? { doi: paper.doi } : {}),
    ...("arxivId" in paper && paper.arxivId ? { arxivId: paper.arxivId } : {}),
    title: paper.title,
    ...(paper.year ? { year: paper.year } : {}),
    ...(paper.venue ? { venue: paper.venue } : {}),
    authors: paper.authors.map((author) => ({ name: author.name })),
    ...("abstract" in paper && paper.abstract ? { abstract: paper.abstract } : {}),
    citationCount: paper.citationCount,
    source: paper.source,
    ...("isRead" in paper && paper.isRead !== undefined ? { isRead: paper.isRead } : {}),
    ...("isFavorite" in paper && paper.isFavorite !== undefined ? { isFavorite: paper.isFavorite } : {}),
  }
}

function serverError(error: unknown) {
  if (error instanceof InvalidRequestError) return error
  return new UnknownError({
    message: error instanceof Error ? error.message : String(error),
    ref: "researchos-literature",
  })
}
