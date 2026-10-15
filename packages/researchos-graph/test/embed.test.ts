import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { embedGraphNodes, type Embedder } from "../src/embed"
import { SqliteStore } from "../src/store"
import type { GraphNode } from "../src/types"

const DIMS = 384

function node(id: string, label: string): GraphNode {
  return { id, type: "concept", label, refId: null, sourcePath: null, attrs: {}, x: null, y: null }
}

function vector(words: string[]): number[] {
  const vec = new Array<number>(DIMS).fill(0)
  words.forEach((word) => {
    vec[Array.from(word).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0) % DIMS] = 1
  })
  return vec
}

const embedder: Embedder = (texts) => Promise.resolve(texts.map((text) => vector(text.toLowerCase().match(/[a-z]+/g) ?? [])))

describe("embedGraphNodes", () => {
  let dir: string
  let store: SqliteStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-embed-"))
    store = new SqliteStore(dir)
  })

  afterEach(async () => {
    store.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("populates embeddings for the given nodes", async () => {
    if (!store.vecAvailable) return
    await embedGraphNodes([node("concept:quantum", "Quantum Computing"), node("concept:attention", "Attention Mechanism")], store, embedder)
    expect(store.hasEmbedding("concept:quantum")).toBe(true)
    expect(store.hasEmbedding("concept:attention")).toBe(true)
    const hits = store.knn(vector(["quantum", "computing"]), 4)
    expect(hits[0]?.nodeId).toBe("concept:quantum")
  })

  test("dedupes repeated node ids and skips nodes that already have embeddings", async () => {
    if (!store.vecAvailable) return
    let embedded = 0
    const counting: Embedder = (texts) => {
      embedded += texts.length
      return embedder(texts)
    }
    const nodes = [node("concept:alpha", "Alpha"), node("concept:beta", "Beta")]
    await embedGraphNodes([...nodes, ...nodes], store, counting)
    expect(embedded).toBe(2)
    await embedGraphNodes(nodes, store, counting)
    expect(embedded).toBe(2)
  })

  test("swallows embedder failures so reindex stays healthy", async () => {
    if (!store.vecAvailable) return
    const failing: Embedder = () => Promise.reject(new Error("model unavailable"))
    await embedGraphNodes([node("concept:x", "X")], store, failing)
    expect(store.hasEmbedding("concept:x")).toBe(false)
  })

  test("is a no-op without an embedder or without vector support", async () => {
    await embedGraphNodes([node("concept:x", "X")], store, null)
    expect(store.hasEmbedding("concept:x")).toBe(false)
    // Bolt 形态的仓库：没有向量成员时直接跳过
    await embedGraphNodes([node("concept:x", "X")], { vecAvailable: false }, embedder)
  })
})
