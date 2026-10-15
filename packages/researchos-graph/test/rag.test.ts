import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { Embedder } from "../src/embed"
import { graphRag } from "../src/rag"
import { SqliteStore } from "../src/store"
import type { GraphNode } from "../src/types"

const DIMS = 384

function node(id: string, type: GraphNode["type"], label: string, extras: Partial<GraphNode> = {}): GraphNode {
  return { id, type, label, refId: null, sourcePath: null, attrs: {}, x: null, y: null, ...extras }
}

function vector(words: string[]): number[] {
  const vec = new Array<number>(DIMS).fill(0)
  words.forEach((word) => {
    vec[Array.from(word).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0) % DIMS] = 1
  })
  return vec
}

function seedGraph(store: SqliteStore) {
  store.upsertNodes([
    node("paper:attention", "paper", "Attention Is All You Need"),
    node("concept:attention-mechanism", "concept", "Attention Mechanism"),
    node("concept:flash-attention", "concept", "FlashAttention"),
    node("repo:github-com-dao-flash", "repo", "flash-attention repo"),
    node("concept:quantum", "concept", "Quantum Computing"),
  ])
  store.upsertEdges([
    { from: "paper:attention", to: "concept:attention-mechanism", relation: "mentions", context: "self-attention instead of recurrence", sourcePath: "papers/a.md" },
    { from: "concept:flash-attention", to: "concept:attention-mechanism", relation: "evolves", context: "IO-aware exact attention", sourcePath: "notes/f.md" },
    { from: "repo:github-com-dao-flash", to: "concept:flash-attention", relation: "implements", context: null, sourcePath: null },
  ])
  // 向量写入与标签语义一致，保证 KNN 召回可预测
  ;[
    ["paper:attention", ["attention", "transformer"]],
    ["concept:attention-mechanism", ["attention", "mechanism"]],
    ["concept:flash-attention", ["flash", "attention"]],
    ["repo:github-com-dao-flash", ["repo", "flash"]],
    ["concept:quantum", ["quantum"]],
  ].forEach(([id, words]) => store.upsertEmbedding(id as string, vector(words as string[])))
}

const embedder: Embedder = (texts) => Promise.resolve(texts.map((text) => vector(text.toLowerCase().match(/[a-z]+/g) ?? [])))

describe("graphRag", () => {
  let dir: string
  let store: SqliteStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-rag-"))
    store = new SqliteStore(dir)
    seedGraph(store)
  })

  afterEach(async () => {
    store.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("recalls by vector, expands k-hop, and packs context", async () => {
    if (!store.vecAvailable) {
      console.warn("sqlite-vec unavailable; skipping vector recall assertions")
      return
    }
    const result = await graphRag("attention mechanism", undefined, store, embedder)
    expect(result.degraded).toBe(false)
    expect(result.seeds.length).toBeGreaterThan(0)
    expect(result.seeds.some((seed) => seed.id === "concept:attention-mechanism")).toBe(true)
    // 1 跳扩展应带上 attention 论文与 flash-attention，但带不到 repo（2 跳）
    const ids = result.subgraph.nodes.map((n) => n.id)
    expect(ids).toContain("paper:attention")
    expect(ids).toContain("concept:flash-attention")
    expect(result.contextPack).toContain("Attention Mechanism")
    expect(result.contextPack).toContain("self-attention instead of recurrence")
  })

  test("depth 2 reaches the repo node", async () => {
    if (!store.vecAvailable) return
    const result = await graphRag("attention mechanism", { depth: 2 }, store, embedder)
    expect(result.subgraph.nodes.map((n) => n.id)).toContain("repo:github-com-dao-flash")
  })

  test("center node joins the expansion even when not recalled", async () => {
    if (!store.vecAvailable) return
    const result = await graphRag("attention mechanism", { centerNode: "concept:quantum", depth: 1 }, store, embedder)
    expect(result.subgraph.nodes.map((n) => n.id)).toContain("concept:quantum")
  })

  test("degrades to FTS recall when no embedder is injected", async () => {
    const result = await graphRag("quantum", undefined, store, null)
    expect(result.degraded).toBe(true)
    expect(result.seeds.map((seed) => seed.id)).toEqual(["concept:quantum"])
    expect(result.subgraph.nodes.map((n) => n.id)).toContain("concept:quantum")
  })

  // 与 sqlite-vec 可用性无关：任何声明向量能力的 store 都必须走 KNN 分支
  test("takes the vector branch whenever the store advertises vectors", async () => {
    const recalled = node("concept:knn-only", "concept", "KNN Only Concept")
    const stub = {
      vecAvailable: true,
      knn: () => [{ nodeId: recalled.id, distance: 0.1 }],
      getNode: (id: string) => (id === recalled.id ? recalled : null),
      search: () => [node("concept:fts-only", "concept", "FTS Only Concept")],
      neighbors: () => ({ nodes: [], edges: [] }),
    }
    const result = await graphRag("anything", undefined, stub, embedder)
    expect(result.degraded).toBe(false)
    expect(result.seeds.map((seed) => seed.id)).toEqual(["concept:knn-only"])
  })

  test("empty graph returns an empty subgraph with a degraded flag", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "graph-rag-empty-"))
    const empty = new SqliteStore(emptyDir)
    const result = await graphRag("anything", undefined, empty, null)
    expect(result.subgraph.nodes).toHaveLength(0)
    expect(result.contextPack).toBe("")
    expect(result.degraded).toBe(true)
    empty.close()
    await rm(emptyDir, { recursive: true, force: true }).catch(() => {})
  })
})
