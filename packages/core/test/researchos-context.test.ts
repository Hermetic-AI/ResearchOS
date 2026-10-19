import { describe, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { AbsolutePath } from "@opencode/core/schema"
import { Location } from "@opencode/core/location"
import { ResearchOSContext } from "@opencode/core/researchos-context"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { readInitial, readUpdate } from "./lib/instructions"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

const locationLayer = (project: string) =>
  Layer.succeed(
    Location.Service,
    Location.Service.of(location(Location.Ref.make({ directory: AbsolutePath.make(project) }))),
  )

const load = (project: string) =>
  Effect.gen(function* () {
    const context = yield* ResearchOSContext.Service
    return yield* context.load()
  }).pipe(
    Effect.provide(AppNodeBuilder.build(ResearchOSContext.node, [Location.node.replace(locationLayer(project))])),
  )

const withTmpdir = <A, E, R>(run: (tmp: { path: string }) => Effect.Effect<A, E, R>) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap(run))

function createDatabase(file: string) {
  const db = new Database(file)
  db.run(`CREATE TABLE paper (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    year INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  db.run(`CREATE TABLE collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`)
  db.run(`CREATE TABLE paper_collection (
    paper_id TEXT NOT NULL,
    collection_id INTEGER NOT NULL,
    PRIMARY KEY (paper_id, collection_id)
  )`)
  return db
}

function insertPaper(db: Database, paper: { id: string; title: string; year?: number; created_at: number }) {
  db.run("INSERT INTO paper (id, title, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
    paper.id,
    paper.title,
    paper.year ?? null,
    paper.created_at,
    paper.created_at,
  ])
}

const libraryDir = (tmp: { path: string }) => path.join(tmp.path, ".researchos", "literature")

describe("ResearchOSContext", () => {
  it.live("renders the library baseline from the literature database", () =>
    withTmpdir((tmp) =>
      Effect.gen(function* () {
        const dir = libraryDir(tmp)
        yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))
        const db = createDatabase(path.join(dir, "literature.db"))
        insertPaper(db, { id: "p1", title: "Title A", year: 2024, created_at: 100 })
        insertPaper(db, { id: "p2", title: "Title B", year: 2023, created_at: 200 })
        db.run("INSERT INTO collection (name) VALUES (?)", ["Transformers"])
        db.run("INSERT INTO paper_collection (paper_id, collection_id) VALUES (?, ?)", ["p1", 1])
        db.close()

        const initialized = yield* readInitial(yield* load(tmp.path))
        expect(initialized.text).toBe(
          'Literature library: 2 papers. Collections: "Transformers" (1). Recently imported: "Title B" (2023), "Title A" (2024).',
        )
      }),
    ),
  )

  it.live("renders nothing when the database and selection file are absent", () =>
    withTmpdir((tmp) =>
      Effect.gen(function* () {
        const initialized = yield* readInitial(yield* load(tmp.path))
        expect(initialized.text).toBe("")
        expect(initialized.values).toEqual({})
      }),
    ),
  )

  it.live("renders a library update diff after a paper is added", () =>
    withTmpdir((tmp) =>
      Effect.gen(function* () {
        const dir = libraryDir(tmp)
        yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))
        const file = path.join(dir, "literature.db")
        const db = createDatabase(file)
        insertPaper(db, { id: "p1", title: "Title A", year: 2024, created_at: 100 })
        insertPaper(db, { id: "p2", title: "Title B", created_at: 200 })
        db.close()

        const initialized = yield* readInitial(yield* load(tmp.path))
        expect(initialized.text).toBe(
          'Literature library: 2 papers. Recently imported: "Title B", "Title A" (2024).',
        )

        const next = new Database(file)
        insertPaper(next, { id: "p3", title: "Title C", year: 2025, created_at: 300 })
        next.close()

        const update = yield* readUpdate(yield* load(tmp.path), initialized)
        expect(update.text).toBe('Literature library updated: 3 papers (was 2). New: "Title C" (2025).')
      }),
    ),
  )

  it.live("renders the current selection and focus changes", () =>
    withTmpdir((tmp) =>
      Effect.gen(function* () {
        const dir = path.join(tmp.path, ".researchos")
        const file = path.join(dir, "selection.json")
        yield* Effect.promise(async () => {
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(file, JSON.stringify({ paperId: "p1", title: "Paper One" }))
        })

        const initialized = yield* readInitial(yield* load(tmp.path))
        expect(initialized.text).toBe(
          'The user is currently viewing paper "Paper One" (p1) in the ResearchOS literature module.',
        )

        yield* Effect.promise(() => fs.writeFile(file, JSON.stringify({ paperId: "p2", title: "Paper Two" })))
        const focused = yield* readUpdate(yield* load(tmp.path), initialized)
        expect(focused.text).toBe('The user\'s focus changed to paper "Paper Two" (p2).')

        yield* Effect.promise(() => fs.rm(file))
        expect((yield* readUpdate(yield* load(tmp.path), focused)).text).toBe(
          "The user is no longer focused on a specific paper.",
        )
      }),
    ),
  )

  it.live("blocks initialization when the selection file is malformed", () =>
    withTmpdir((tmp) =>
      Effect.gen(function* () {
        const dir = path.join(tmp.path, ".researchos")
        yield* Effect.promise(async () => {
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(path.join(dir, "selection.json"), "not json")
        })

        const initialized = yield* readInitial(yield* load(tmp.path)).pipe(Effect.exit)
        expect(initialized._tag).toBe("Failure")
      }),
    ),
  )
})
