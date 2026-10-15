export * as ResearchOSContext from "./researchos-context.js"

import { Effect, Layer, Schema } from "effect"
import { join } from "path"
import { FSUtil } from "./fs-util"
import { Location } from "./location.js"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"
import { makeLocationNode } from "./effect/app-node"

class Collection extends Schema.Class<Collection>("ResearchOSContext.Collection")({
  name: Schema.String,
  count: Schema.Number,
}) {}

class RecentPaper extends Schema.Class<RecentPaper>("ResearchOSContext.RecentPaper")({
  id: Schema.String,
  title: Schema.String,
  year: Schema.NullOr(Schema.Number),
}) {}

class Library extends Schema.Class<Library>("ResearchOSContext.Library")({
  paperCount: Schema.Number,
  collections: Schema.Array(Collection),
  recent: Schema.Array(RecentPaper),
}) {}

class Selection extends Schema.Class<Selection>("ResearchOSContext.Selection")({
  paperId: Schema.String,
  title: Schema.NullOr(Schema.String),
}) {}

const SelectionFile = Schema.Struct({
  paperId: Schema.String,
  title: Schema.optional(Schema.String),
})

const libraryKey = SystemContext.Key.make("researchos/library")
const selectionKey = SystemContext.Key.make("researchos/selection")

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service

    const librarySource = (value: Library | SystemContext.Unavailable) =>
      SystemContext.make({
        key: libraryKey,
        codec: Schema.toCodecJson(Library),
        load: Effect.succeed(value),
        baseline: renderLibrary,
        update: updateLibrary,
        removed: () => "The literature library is no longer available.",
      })

    const selectionSource = (value: Selection | SystemContext.Unavailable) =>
      SystemContext.make({
        key: selectionKey,
        codec: Schema.toCodecJson(Selection),
        load: Effect.succeed(value),
        baseline: (selection) =>
          `The user is currently viewing ${describe(selection)} in the ResearchOS literature module.`,
        update: (_previous, selection) => `The user's focus changed to ${describe(selection)}.`,
        removed: () => "The user is no longer focused on a specific paper.",
      })

    // Returns undefined when the library database is absent; failures throw and
    // become `unavailable` at the registration boundary below.
    const observeLibrary = Effect.fn("ResearchOSContext.observeLibrary")(function* () {
      const path = join(location.project.directory, ".researchos", "literature", "literature.db")
      if (!(yield* fs.isFile(path))) return undefined
      return yield* Effect.tryPromise({
        try: async () => {
          // Imported lazily so loading this module does not require the bun sqlite runtime.
          const { Database } = await import("bun:sqlite")
          const db = new Database(path, { readonly: true, create: false })
          try {
            return queryLibrary(db)
          } finally {
            db.close()
          }
        },
        catch: (cause) => cause,
      })
    })

    const observeSelection = Effect.fn("ResearchOSContext.observeSelection")(function* () {
      const path = join(location.project.directory, ".researchos", "selection.json")
      if (!(yield* fs.isFile(path))) return undefined
      const file = yield* fs.readJson(path).pipe(Effect.flatMap(Schema.decodeUnknownEffect(SelectionFile)))
      return new Selection({ paperId: file.paperId, title: file.title ?? null })
    })

    yield* registry.register({
      key: libraryKey,
      load: observeLibrary().pipe(
        Effect.map((value) => (value === undefined ? SystemContext.empty : librarySource(value))),
        Effect.catch(() => Effect.succeed(librarySource(SystemContext.unavailable))),
        Effect.catchDefect(() => Effect.succeed(librarySource(SystemContext.unavailable))),
      ),
    })

    yield* registry.register({
      key: selectionKey,
      load: observeSelection().pipe(
        Effect.map((value) => (value === undefined ? SystemContext.empty : selectionSource(value))),
        Effect.catch(() => Effect.succeed(selectionSource(SystemContext.unavailable))),
        Effect.catchDefect(() => Effect.succeed(selectionSource(SystemContext.unavailable))),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "researchos-context",
  layer,
  deps: [FSUtil.node, Location.node, SystemContextRegistry.node],
})

function queryLibrary(db: import("bun:sqlite").Database) {
  const count = db.query("SELECT COUNT(*) AS count FROM paper").get() as { count: number }
  const collections = db
    .query(
      `SELECT c.name AS name, COUNT(pc.paper_id) AS count
       FROM collection c
       LEFT JOIN paper_collection pc ON pc.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.name`,
    )
    .all() as Array<{ name: string; count: number }>
  const recent = db
    .query("SELECT id, title, year FROM paper ORDER BY created_at DESC LIMIT 5")
    .all() as Array<{ id: string; title: string; year: number | null }>
  return new Library({
    paperCount: count.count,
    collections: collections.map((row) => new Collection({ name: row.name, count: row.count })),
    recent: recent.map((row) => new RecentPaper({ id: row.id, title: row.title, year: row.year })),
  })
}

function renderPaper(paper: RecentPaper) {
  if (paper.year === null) return `"${paper.title}"`
  return `"${paper.title}" (${paper.year})`
}

function renderLibrary(library: Library) {
  const parts = [`Literature library: ${library.paperCount} papers.`]
  if (library.collections.length > 0)
    parts.push(`Collections: ${library.collections.map((item) => `"${item.name}" (${item.count})`).join(", ")}.`)
  if (library.recent.length > 0) parts.push(`Recently imported: ${library.recent.map(renderPaper).join(", ")}.`)
  return parts.join(" ")
}

function updateLibrary(previous: Library, current: Library) {
  const known = new Set(previous.recent.map((paper) => paper.id))
  const added = current.recent.filter((paper) => !known.has(paper.id))
  if (current.paperCount === previous.paperCount && added.length === 0)
    return `Literature library details changed. ${renderLibrary(current)}`
  const parts = [`Literature library updated: ${current.paperCount} papers (was ${previous.paperCount}).`]
  if (added.length > 0) parts.push(`New: ${added.map(renderPaper).join(", ")}.`)
  return parts.join(" ")
}

function describe(selection: Selection) {
  if (selection.title === null) return `paper ${selection.paperId}`
  return `paper "${selection.title}" (${selection.paperId})`
}
