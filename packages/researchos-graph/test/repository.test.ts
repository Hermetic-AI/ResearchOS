import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { loadGraphBackend } from "../src/backend"
import type { Embedder } from "../src/embed"
import { graphRag } from "../src/rag"
import { openRepository } from "../src/repository"

const DIMS = 384

function vector(words: string[]): number[] {
  const vec = new Array<number>(DIMS).fill(0)
  words.forEach((word) => {
    vec[Array.from(word).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0) % DIMS] = 1
  })
  return vec
}

const embedder: Embedder = (texts) => Promise.resolve(texts.map((text) => vector(text.toLowerCase().match(/[a-z]+/g) ?? [])))

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined)))
})

describe("graph repository configuration", () => {
  test("defaults to the project-local SQLite repository", async () => {
    const directory = await project()
    expect(await loadGraphBackend(directory)).toEqual({ backend: "sqlite" })
    const repository = await openRepository(directory)
    expect(repository.backend).toBe("sqlite")
    await repository.upsertNodes([{ id: "concept:test", type: "concept", label: "Test", attrs: {} }])
    expect((await repository.getNode("concept:test"))?.label).toBe("Test")
    await repository.close()
  })

  test("exposes vector recall through the SQLite repository adapter", async () => {
    const directory = await project()
    const repository = await openRepository(directory)
    if (!repository.vecAvailable) {
      console.warn("sqlite-vec unavailable; skipping vector round-trip assertions")
      await repository.close()
      return
    }
    expect(typeof repository.knn).toBe("function")
    expect(typeof repository.upsertEmbedding).toBe("function")
    await repository.upsertNodes([{ id: "concept:vec", type: "concept", label: "Vec", attrs: {} }])
    const embedding = Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0))
    repository.upsertEmbedding?.("concept:vec", embedding)
    expect(repository.knn?.(embedding, 1)[0]?.nodeId).toBe("concept:vec")
    // 覆盖写（DELETE+INSERT）后仍只命中一行
    repository.upsertEmbedding?.("concept:vec", embedding)
    expect(repository.knn?.(embedding, 5)).toHaveLength(1)
    await repository.close()
  })

  test("loads a configured Bolt backend without reading credentials", async () => {
    const directory = await project()
    await Bun.write(join(directory, ".opencode", "researchos.json"), JSON.stringify({
      graph: { backend: "neo4j", uri: "bolt://127.0.0.1:7687", usernameEnv: "GRAPH_USER", passwordEnv: "GRAPH_PASSWORD" },
    }))
    expect(await loadGraphBackend(directory)).toMatchObject({ backend: "neo4j", uri: "bolt://127.0.0.1:7687" })
  })

  test.if(process.env.RESEARCHOS_GRAPH_BOLT_TEST === "1")("writes and reads through the configured Bolt backend", async () => {
    const directory = await project()
    const backend = process.env.RESEARCHOS_GRAPH_BACKEND ?? "neo4j"
    const auth = process.env.GRAPH_USER && process.env.GRAPH_PASSWORD
      ? { usernameEnv: "GRAPH_USER", passwordEnv: "GRAPH_PASSWORD" }
      : {}
    await Bun.write(join(directory, ".opencode", "researchos.json"), JSON.stringify({
      graph: { backend, uri: process.env.RESEARCHOS_GRAPH_URI ?? "bolt://127.0.0.1:7687", database: process.env.RESEARCHOS_GRAPH_DATABASE, ...auth },
    }))
    const repository = await openRepository(directory)
    await repository.replaceBySource("notes/neo4j.md", {
      nodes: [
        { id: "note:neo4j", type: "note", label: "Neo4j note", sourcePath: "notes/neo4j.md", attrs: {} },
        { id: "concept:bolt", type: "concept", label: "Bolt", attrs: {} },
      ],
      edges: [{ from: "note:neo4j", to: "concept:bolt", relation: "mentions", sourcePath: "notes/neo4j.md" }],
    })
    expect((await repository.getNode("note:neo4j"))?.label).toBe("Neo4j note")
    expect((await repository.neighbors("note:neo4j", 1)).edges).toHaveLength(1)
    await repository.close()
  })
})

async function project() {
  const directory = await mkdtemp(join(tmpdir(), "researchos-graph-repository-"))
  directories.push(directory)
  await writeFile(join(directory, ".gitignore"), "")
  await mkdir(join(directory, ".opencode"))
  await Bun.write(join(directory, ".opencode", ".gitkeep"), "")
  return directory
}

describe("graph repository vector passthrough", () => {
  test("recalls via KNN with an embedder and degrades to FTS without one", async () => {
    const directory = await project()
    const repository = await openRepository(directory)
    await repository.upsertNodes([
      { id: "concept:attention-mechanism", type: "concept", label: "Attention Mechanism", attrs: {} },
      { id: "concept:quantum", type: "concept", label: "Quantum Computing", attrs: {} },
    ])
    if (!repository.vecAvailable) {
      console.warn("sqlite-vec unavailable; skipping vector passthrough assertions")
      await repository.close()
      return
    }
    repository.upsertEmbedding?.("concept:attention-mechanism", vector(["attention", "mechanism"]))
    repository.upsertEmbedding?.("concept:quantum", vector(["quantum"]))
    const result = await graphRag("attention mechanism", undefined, repository, embedder)
    expect(result.degraded).toBe(false)
    expect(result.seeds[0]?.id).toBe("concept:attention-mechanism")
    const degraded = await graphRag("quantum", undefined, repository, null)
    expect(degraded.degraded).toBe(true)
    expect(degraded.seeds.map((seed) => seed.id)).toContain("concept:quantum")
    await repository.close()
  })
})
