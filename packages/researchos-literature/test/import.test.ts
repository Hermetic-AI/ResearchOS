import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { ApiAdapter, ApiDescriptor, ApiHub, ApiStatus } from "@researchos/api-hub"
import type { Embedder } from "../src/embed"
import { importPdf } from "../src/import"
import { LiteratureService } from "../src/service"
import { makePdf } from "./fixtures/pdf"

// 导入现在会对全文分块做嵌入；测试注入 no-op embedder，避免下载真实模型拖慢套件
const noopEmbedder: Embedder = () => Promise.resolve([])

const PAGES = [
  [
    "Attention Is All You Need",
    "Ashish Vaswani, Noam Shazeer, Niki Parmar",
    "arXiv:1706.03762v5",
    "doi: 10.48550/arXiv.1706.03762",
    "2017",
  ],
  [
    "The dominant sequence transduction models are based on recurrent networks.",
    "",
    "References",
    "[1] Dzmitry Bahdanau, Kyunghyun Cho, Yoshua Bengio. Neural machine translation by jointly learning to align and translate. In ICLR, 2015. doi: 10.48550/arXiv.1409.0473",
    "[2] Alec Radford, Jong Wook Kim, Chris Hallacy. Learning transferable visual models from natural language supervision. In ICML, 2021. arXiv:2103.00020",
    "[3] Jacob Devlin, Ming-Wei Chang. BERT pre-training of deep bidirectional transformers. In NAACL, 2019.",
  ],
]

function fakeHub(fail = false): ApiHub {
  return {
    call: <TReq, TRes>(adapter: ApiAdapter<TReq, TRes>): Promise<TRes> => {
      if (fail) return Promise.reject(new Error("network down"))
      if (adapter.descriptor.name === "crossref") {
        return Promise.resolve({
          message: {
            items: [{
              DOI: "10.48550/arXiv.1706.03762",
              title: ["Attention Is All You Need"],
              author: [{ given: "Ashish", family: "Vaswani" }, { given: "Noam", family: "Shazeer" }],
              issued: { "date-parts": [[2017]] },
              "container-title": ["NeurIPS"],
            }],
          },
        } as TRes)
      }
      return Promise.resolve({ data: [] } as TRes)
    },
    status: (name: string): ApiStatus => ({
      name, healthy: true, state: "healthy", callsTotal: 0, cacheHitRate: 0, availableTokens: 0,
    }),
    list: (): ApiDescriptor[] => [],
    test: () => Promise.resolve({ ok: true, latencyMs: 0 }),
  }
}

describe("importPdf", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "literature-import-"))
    await mkdir(join(dir, "papers"), { recursive: true })
    await writeFile(join(dir, "papers", "attention.pdf"), makePdf(PAGES))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("imports a local PDF: enriches via crossref, archives file, persists paper and citation edges", async () => {
    const service = await LiteratureService.open(dir, fakeHub(), noopEmbedder)
    const result = await service.importPdf({ path: "papers/attention.pdf" })

    expect(result.metadataSource).toBe("crossref")
    expect(result.paper.title).toBe("Attention Is All You Need")
    expect(result.paper.year).toBe(2017)
    expect(result.paper.venue).toBe("NeurIPS")
    expect(result.paper.authors.map((author) => author.name)).toEqual(["Ashish Vaswani", "Noam Shazeer"])
    expect(result.paper.pdfPath).toBe(`pdfs/2017/${result.paper.id}.pdf`)

    const archived = join(dir, ".researchos", "literature", "pdfs", "2017", `${result.paper.id}.pdf`)
    expect(await Bun.file(archived).exists()).toBe(true)

    const stored = service.get(result.paper.id)
    expect(stored?.title).toBe("Attention Is All You Need")
    expect(stored?.source).toBe("crossref")

    const refs = await service.getCitations(result.paper.id, "references")
    expect(refs.length).toBe(3)
    expect(refs.every((ref) => !ref.inLibrary)).toBe(true)
    expect(refs.every((ref) => ref.source === "pdf")).toBe(true)
    expect(refs.find((ref) => ref.doi === "10.48550/arxiv.1409.0473")?.title)
      .toBe("Neural machine translation by jointly learning to align and translate")
    service.close()
  })

  test("falls back to PDF-extracted metadata when the hub fails", async () => {
    const service = await LiteratureService.open(dir, fakeHub(true), noopEmbedder)
    const result = await service.importPdf({ path: "papers/attention.pdf" })
    expect(result.metadataSource).toBe("pdf")
    expect(result.paper.source).toBe("manual")
    expect(result.paper.title).toBe("Attention Is All You Need")
    expect(result.paper.doi).toBe("10.48550/arXiv.1706.03762")
    expect(result.references.edges.length).toBe(3)
    service.close()
  })

  test("rejects paths escaping the project root", async () => {
    const service = await LiteratureService.open(dir, fakeHub(), noopEmbedder)
    await expect(service.importPdf({ path: "../outside.pdf" })).rejects.toThrow(/escapes project root/)
    service.close()
  })

  test("requires exactly one of path or url", async () => {
    await expect(importPdf({}, { projectRoot: dir })).rejects.toThrow(/exactly one/)
    await expect(importPdf({ path: "a.pdf", url: "https://example.com/x.pdf" }, { projectRoot: dir }))
      .rejects.toThrow(/exactly one/)
  })

  test("rejects non-http URLs", async () => {
    await expect(importPdf({ url: "file:///etc/passwd" }, { projectRoot: dir })).rejects.toThrow(/protocol/)
  })

  test("downloads PDFs from http URLs through the injected fetch", async () => {
    const result = await importPdf({ url: "https://example.com/papers/attention.pdf" }, {
      projectRoot: dir,
      hub: fakeHub(),
      fetch: async () => new Response(makePdf(PAGES)),
    })
    expect(result.paper.title).toBe("Attention Is All You Need")
    expect(await Bun.file(join(dir, ".researchos", "literature", result.paper.pdfPath!)).exists()).toBe(true)
  })
})
