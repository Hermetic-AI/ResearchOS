import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { ApiAdapter, ApiDescriptor, ApiHub, ApiStatus } from "@researchos/api-hub"
import { LiteratureDB } from "../src/db"
import { computePaperId } from "../src/import"
import { LiteratureService } from "../src/service"
import type { PaperMeta } from "../src/types"

const TARGET: PaperMeta = {
  id: "target",
  doi: "10.1000/target",
  arxivId: null,
  title: "A Target Paper",
  year: 2020,
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

function citingHub(fail = false): ApiHub {
  return {
    call: <TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes> => {
      if (fail) return Promise.reject(new Error("network down"))
      expect(adapter.descriptor.name).toBe("semantic_scholar_citations")
      expect((req as { paperId: string }).paperId).toBe("DOI:10.1000/target")
      return Promise.resolve({
        data: [{
          citingPaper: {
            paperId: "s2-c1",
            title: "A Citing Work",
            authors: [{ name: "Grace Hopper" }],
            year: 2024,
            externalIds: { DOI: "10.1000/citing" },
          },
        }],
      } as TRes)
    },
    status: (name: string): ApiStatus => ({
      name, healthy: true, state: "healthy", callsTotal: 0, cacheHitRate: 0, availableTokens: 0,
    }),
    list: (): ApiDescriptor[] => [],
    test: () => Promise.resolve({ ok: true, latencyMs: 0 }),
  }
}

describe("getCitations cited_by online enrichment", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cited-by-test-"))
    const db = new LiteratureDB(dir)
    await db.init()
    db.insertPaper(TARGET)
    db.close()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("fetches S2 citing papers, persists edges, and serves them locally afterwards", async () => {
    const service = await LiteratureService.open(dir, citingHub())
    const cited = await service.getCitations("target", "cited_by")
    expect(cited).toHaveLength(1)
    expect(cited[0]?.id).toBe(computePaperId("10.1000/citing", null, "A Citing Work"))
    expect(cited[0]?.title).toBe("A Citing Work")
    expect(cited[0]?.year).toBe(2024)
    expect(cited[0]?.source).toBe("semantic_scholar")
    expect(cited[0]?.inLibrary).toBe(false)
    service.close()

    // 第二次查询即使在线失败也能返回已落库的边
    const offline = await LiteratureService.open(dir, citingHub(true))
    const cached = await offline.getCitations("target", "cited_by")
    expect(cached).toHaveLength(1)
    expect(cached[0]?.title).toBe("A Citing Work")
    offline.close()
  })

  test("references direction stays local-only", async () => {
    const service = await LiteratureService.open(dir, citingHub(true))
    expect(await service.getCitations("target", "references")).toEqual([])
    service.close()
  })
})
