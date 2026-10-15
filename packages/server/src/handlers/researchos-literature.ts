import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import { LiteratureService, type PaperMeta, type SearchResult } from "@researchos/literature"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { mkdirSync } from "fs"
import { rm } from "fs/promises"
import { dirname, join } from "path"
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
        if (!payload.path && !payload.url && !payload.contentBase64) {
          throw new InvalidRequestError({ message: "literature.import requires a PDF file, path, URL, or zoteroPath" })
        }
        if (payload.contentBase64) return importUploadedPdf(library, payload.contentBase64)
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
      )))
      .handle("literature.read", ({ params, payload }) => response(withLibrary((library) =>
        library.read(params.id, payload.query, payload.k).then((result) => ({
          degraded: result.degraded,
          sections: result.sections.map((section) => ({
            ...(section.section ? { section: section.section } : {}),
            text: section.text,
            score: section.score,
          })),
        })),
      )))
      .handle("literature.update", ({ params, payload }) => response(withLibrary((library) => {
        const updated = library.updatePaper(params.id, {
          ...(payload.isRead !== undefined ? { isRead: payload.isRead } : {}),
          ...(payload.isFavorite !== undefined ? { isFavorite: payload.isFavorite } : {}),
        })
        if (!updated) throw new InvalidRequestError({ message: `Unknown paper: ${params.id}` })
        return Promise.resolve(wirePaper(updated))
      })))
      .handle("literature.select", ({ payload }) => response(Effect.gen(function* () {
        const location = yield* Location.Service
        const path = join(location.project.directory, ".researchos", "selection.json")
        yield* Effect.tryPromise({
          try: async () => {
            if (!payload.paperId) {
              await rm(path, { force: true })
              return
            }
            mkdirSync(dirname(path), { recursive: true })
            await Bun.write(path, JSON.stringify({
              paperId: payload.paperId,
              ...(payload.title ? { title: payload.title } : {}),
            }, null, 2))
          },
          catch: serverError,
        })
        return { ok: true }
      }))),
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

async function importUploadedPdf(library: LiteratureService, contentBase64: string) {
  const data = Buffer.from(contentBase64, "base64")
  if (data.byteLength > 50 * 1024 * 1024) throw new InvalidRequestError({ message: "PDF upload exceeds the 50 MB limit" })
  if (new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-") {
    throw new InvalidRequestError({ message: "The selected file is not a valid PDF" })
  }
  const path = join(library.projectRoot, ".researchos", "literature", "uploads", `${crypto.randomUUID()}.pdf`)
  mkdirSync(dirname(path), { recursive: true })
  await Bun.write(path, data)
  try {
    const result = await library.importPdf({ path })
    return {
      paper: wirePaper(result.paper),
      metadataSource: result.metadataSource,
      references: result.references.edges.length,
    }
  } finally {
    await rm(path, { force: true }).catch(() => {})
  }
}
