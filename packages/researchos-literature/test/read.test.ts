import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { ApiAdapter, ApiDescriptor, ApiHub, ApiStatus } from "@researchos/api-hub"
import { LiteratureDB } from "../src/db"
import type { Embedder } from "../src/embed"
import { textDir } from "../src/paths"
import { LiteratureService } from "../src/service"
import type { PaperMeta } from "../src/types"

const DIMS = 384

// 与 recommend.test.ts 相同的确定性词袋哈希向量：共享词越多向量越近
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

const throwingEmbedder: Embedder = () => Promise.reject(new Error("model unavailable"))

function offlineHub(): ApiHub {
  return {
    call: <TReq, TRes>(_adapter: ApiAdapter<TReq, TRes>, _req: TReq): Promise<TRes> =>
      Promise.reject(new Error("offline")),
    status: (name: string): ApiStatus => ({
      name, healthy: true, state: "healthy", callsTotal: 0, cacheHitRate: 0, availableTokens: 0,
    }),
    list: (): ApiDescriptor[] => [],
    test: () => Promise.resolve({ ok: true, latencyMs: 0 }),
  }
}

const PAPER: PaperMeta = {
  id: "paper1",
  doi: null,
  arxivId: null,
  title: "Quantum Calibration",
  year: 2024,
  venue: null,
  abstract: null,
  keywords: [],
  citationCount: 0,
  pdfPath: null,
  source: "manual",
  isRead: false,
  isFavorite: false,
  notesMd: null,
  authors: [],
  createdAt: 0,
  updatedAt: 0,
}

const SECTIONS = [
  { section: "Abstract", seq: 0, text: "We study superconducting hardware and propose a calibration protocol." },
  { section: "2 Methods", seq: 1, text: "We calibrate the qubit array with randomized benchmarking and measure qubit calibration fidelity." },
  { section: "3 Results", seq: 2, text: "The observed outcome remains stable across the array over many weeks." },
]

const FULL_TEXT = [
  "Abstract",
  SECTIONS[0]!.text,
  "",
  "2 Methods",
  SECTIONS[1]!.text,
  "",
  "3 Results",
  SECTIONS[2]!.text,
  "",
  "References",
  "[1] J. Preskill, Quantum computing in the NISQ era.",
].join("\n")

describe("LiteratureService.read", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "read-test-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function seedPaper(withEmbeddings: boolean): Promise<boolean> {
    const db = new LiteratureDB(dir)
    await db.init()
    const vec = db.vecAvailable
    db.insertPaper(PAPER)
    db.replaceChunks(PAPER.id, SECTIONS)
    if (withEmbeddings && vec) {
      const embeddings = await fakeEmbedder(SECTIONS.map((chunk) => chunk.text))
      db.upsertChunkEmbeddings(SECTIONS.flatMap((chunk, i) => {
        const embedding = embeddings[i]
        return embedding ? [{ chunkId: `${PAPER.id}:${chunk.seq}`, embedding }] : []
      }))
    }
    db.close()
    return vec
  }

  test("ranks the section matching the query on top", async () => {
    const vec = await seedPaper(true)
    if (!vec) {
      console.warn("sqlite-vec unavailable on this machine; skipping KNN assertions")
      return
    }
    const service = await LiteratureService.open(dir, offlineHub(), fakeEmbedder)
    const result = await service.read(PAPER.id, "qubit calibration fidelity", 2)
    service.close()
    expect(result.degraded).toBe(false)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.sections[0]?.section).toBe("2 Methods")
    expect(result.sections[0]?.score).toBeGreaterThan(0)
  })

  test("builds chunks lazily from the persisted full text when none are stored", async () => {
    const db = new LiteratureDB(dir)
    await db.init()
    const vec = db.vecAvailable
    db.insertPaper(PAPER)
    db.close()
    await mkdir(textDir(dir), { recursive: true })
    await writeFile(join(textDir(dir), `${PAPER.id}.txt`), FULL_TEXT)

    const service = await LiteratureService.open(dir, offlineHub(), fakeEmbedder)
    const result = await service.read(PAPER.id, "qubit calibration", 3)
    service.close()
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.degraded).toBe(!vec)

    // 分块已落库：第二次打开无需重建即可检索
    const check = new LiteratureDB(dir)
    await check.init()
    expect(check.chunkCount(PAPER.id)).toBe(3)
    check.close()
  })

  test("degrades to keyword overlap when the embedder fails", async () => {
    await seedPaper(false)
    const service = await LiteratureService.open(dir, offlineHub(), throwingEmbedder)
    const result = await service.read(PAPER.id, "qubit calibration fidelity", 2)
    service.close()
    expect(result.degraded).toBe(true)
    expect(result.sections[0]?.section).toBe("2 Methods")
    expect(result.sections.some((entry) => entry.text.includes("preskill"))).toBe(false)
  })

  test("returns no-fulltext when neither text file nor archived PDF exists", async () => {
    const db = new LiteratureDB(dir)
    await db.init()
    db.insertPaper(PAPER)
    db.close()
    const service = await LiteratureService.open(dir, offlineHub(), fakeEmbedder)
    const result = await service.read("ghost", "anything")
    service.close()
    expect(result.degraded).toBe(true)
    expect(result.reason).toBe("no-fulltext")
    expect(result.sections).toEqual([])
  })
})
