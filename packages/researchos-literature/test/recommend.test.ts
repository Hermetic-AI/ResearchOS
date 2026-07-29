import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { LiteratureDB } from "../src/db"
import type { Embedder } from "../src/embed"
import { recommendSimilar } from "../src/recommend"
import type { PaperMeta } from "../src/types"

const DIMS = 384

// 确定性词袋哈希向量：共享词越多的文本向量越近，"相似"语义可预测
function fakeEmbedder(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map((text) => {
    const vec = new Array<number>(DIMS).fill(0)
    const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
    words.forEach((word) => {
      vec[hash(word) % DIMS] = (vec[hash(word) % DIMS] ?? 0) + 1
    })
    const norm = Math.hypot(...vec) || 1
    return vec.map((value) => value / norm)
  }))
}

function hash(word: string): number {
  return Array.from(word).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0)
}

function paper(id: string, title: string, abstract: string): PaperMeta {
  const base = importPaperSync(title, abstract)
  return { ...base, id }
}

function importPaperSync(title: string, abstract: string): PaperMeta {
  const now = Date.now()
  return {
    id: "x",
    doi: null,
    arxivId: null,
    title,
    year: 2024,
    venue: null,
    abstract,
    keywords: [],
    citationCount: 0,
    pdfPath: null,
    source: "manual",
    isRead: false,
    isFavorite: false,
    notesMd: null,
    authors: [],
    createdAt: now,
    updatedAt: now,
  }
}

describe("recommendSimilar", () => {
  let dir: string
  let db: LiteratureDB

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recommend-test-"))
    db = new LiteratureDB(dir)
    await db.init()
  })

  afterEach(async () => {
    db.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("ranks by KNN distance, applies co-citation bonus, and excludes the target", async () => {
    if (!db.vecAvailable) {
      console.warn("sqlite-vec unavailable on this machine; skipping KNN assertions")
      return
    }
    const embedder: Embedder = fakeEmbedder
    const target = paper("target", "Graph Neural Networks", "graph neural networks for citation recommendation")
    const near = paper("near", "GNN Applications", "graph neural networks applications")
    const mid = paper("mid", "Citation Systems", "citation recommendation systems")
    const boosted = paper("boosted", "Shared Refs Twin", "neural networks survey")
    const plain = paper("plain", "Shared Refs Twin", "neural networks survey")
    const fillers = Array.from({ length: 16 }, (_, i) => paper(`filler-${i}`, `Filler ${i}`, `quantum protein folding topic ${i}`))
    db.insertPapers([target, near, mid, boosted, plain, ...fillers])
    const candidates = [near, mid, boosted, plain, ...fillers]
    const embeddings = await embedder(candidates.map((candidate) => candidate.abstract ?? ""))
    candidates.forEach((candidate, i) => db.upsertEmbedding(candidate.id, embeddings[i]!))

    // boosted 与 plain 向量完全相同；boosted 与 target 共享两条 references
    db.insertExternalPapers([
      { id: "ref-1", title: "Ref One", year: 2020, doi: null },
      { id: "ref-2", title: "Ref Two", year: 2020, doi: null },
    ])
    db.insertCitationEdges([
      { fromId: "target", toId: "ref-1", context: null, source: "pdf" },
      { fromId: "target", toId: "ref-2", context: null, source: "pdf" },
      { fromId: "boosted", toId: "ref-1", context: null, source: "pdf" },
      { fromId: "boosted", toId: "ref-2", context: null, source: "pdf" },
    ])

    const result = await recommendSimilar("target", { db, embedder, limit: 10 })
    expect(result.degraded).toBe(false)
    expect(result.results.some((entry) => entry.id === "target")).toBe(false)
    const nearEntry = result.results.find((entry) => entry.id === "near")
    const midEntry = result.results.find((entry) => entry.id === "mid")
    expect(nearEntry).toBeDefined()
    expect(midEntry).toBeDefined()
    // 共享词更多的 near 纯向量分数高于 mid
    expect(nearEntry!.score).toBeGreaterThan(midEntry!.score)
    const boostedEntry = result.results.find((entry) => entry.id === "boosted")
    const plainEntry = result.results.find((entry) => entry.id === "plain")
    expect(boostedEntry).toBeDefined()
    expect(plainEntry).toBeDefined()
    // 共引加分 = 共享 2 条 × 0.15
    expect(boostedEntry!.score - plainEntry!.score).toBeCloseTo(0.3, 5)
    expect(result.results.indexOf(boostedEntry!)).toBeLessThan(result.results.indexOf(plainEntry!))
    // 目标嵌入被现场计算并落库
    expect(db.getEmbedding("target")).not.toBeNull()
  })

  test("degrades to keyword overlap when no embedder is injected", async () => {
    const target = paper("target", "Graph Neural Networks", "graph neural networks for citation recommendation")
    const overlap = paper("overlap", "Citation Recommendation", "citation recommendation systems")
    const disjoint = paper("disjoint", "Quantum Computing", "quantum computing algorithms")
    db.insertPapers([target, overlap, disjoint])

    const result = await recommendSimilar("target", { db, embedder: null, limit: 10 })
    expect(result.degraded).toBe(true)
    expect(result.results[0]?.id).toBe("overlap")
    expect(result.results.some((entry) => entry.id === "disjoint")).toBe(false)
  })

  test("rejects unknown paper ids", async () => {
    await expect(recommendSimilar("missing", { db, embedder: null })).rejects.toThrow(/Unknown paper/)
  })
})
