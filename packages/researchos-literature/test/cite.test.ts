import { describe, expect, test } from "bun:test"
import { formatCitations, parseBibtex, parseRis, toCslJson } from "../src/cite"
import { toBibtex, toRis } from "../src/export"
import type { PaperMeta } from "../src/types"

const PAPER: PaperMeta = {
  id: "p1",
  doi: "10.48550/arXiv.1706.03762",
  arxivId: null,
  title: "Attention Is All You Need",
  year: 2017,
  venue: "Advances in Neural Information Processing Systems",
  abstract: null,
  keywords: [],
  citationCount: 0,
  pdfPath: null,
  source: "manual",
  isRead: false,
  isFavorite: false,
  notesMd: null,
  authors: [
    { name: "Ashish Vaswani", affiliation: null },
    { name: "Noam Shazeer", affiliation: null },
    { name: "Niki Parmar", affiliation: null },
  ],
  createdAt: 0,
  updatedAt: 0,
}

describe("toCslJson", () => {
  test("maps PaperMeta fields and infers conference type from venue", () => {
    const item = toCslJson(PAPER)
    expect(item.type).toBe("paper-conference")
    expect(item.title).toBe("Attention Is All You Need")
    expect(item.author).toEqual([
      { family: "Vaswani", given: "Ashish" },
      { family: "Shazeer", given: "Noam" },
      { family: "Parmar", given: "Niki" },
    ])
    expect(item.issued).toEqual({ "date-parts": [[2017]] })
    expect(item.DOI).toBe("10.48550/arXiv.1706.03762")
    expect(item["container-title"]).toBe("Advances in Neural Information Processing Systems")
  })

  test("falls back to journal type and literal name for single-word authors", () => {
    const item = toCslJson({ ...PAPER, venue: "Nature", authors: [{ name: "OpenAI", affiliation: null }] })
    expect(item.type).toBe("article-journal")
    expect(item.author).toEqual([{ literal: "OpenAI" }])
  })
})

describe("formatCitations", () => {
  test("ieee renders bracket-numbered entries with DOI suffix", async () => {
    const [line] = await formatCitations([PAPER], "ieee")
    expect(line).toStartWith("[1] ")
    expect(line).toContain("A. Vaswani")
    expect(line).toContain("2017")
    expect(line).toContain("doi: 10.48550/arXiv.1706.03762")
  })

  test("acm renders author-year with et al", async () => {
    const [line] = await formatCitations([PAPER], "acm")
    expect(line).toContain("Vaswani, A. et al. 2017.")
    expect(line).toContain("Attention Is All You Need. Advances in Neural Information Processing Systems (2017)")
  })

  test("apa renders parenthesized year and ampersand author list", async () => {
    const [line] = await formatCitations([PAPER], "apa")
    expect(line).toContain("Vaswani, A., Shazeer, N., & Parmar, N. (2017).")
    expect(line).toContain("https://doi.org/10.48550/arXiv.1706.03762")
  })

  test("nature renders numbered entries with trailing year", async () => {
    const [line] = await formatCitations([PAPER], "nature")
    expect(line).toStartWith("1. ")
    expect(line).toContain("(2017)")
  })

  test("springer renders author-date without initial periods", async () => {
    const [line] = await formatCitations([PAPER], "springer")
    expect(line).toContain("Vaswani A, Shazeer N, Parmar N (2017)")
  })

  test("numbers multiple entries per style", async () => {
    const second = { ...PAPER, id: "p2", title: "BERT: Pre-training of Deep Bidirectional Transformers", year: 2019 }
    const lines = await formatCitations([PAPER, second], "ieee")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toStartWith("[1] ")
    expect(lines[1]).toStartWith("[2] ")
  })
})

describe("round trip", () => {
  test("bibtex serialize then parse keeps key fields", async () => {
    const [parsed] = await parseBibtex(toBibtex(PAPER))
    expect(parsed?.title).toBe("Attention Is All You Need")
    expect(parsed?.author).toHaveLength(3)
    expect(parsed?.author?.[0]?.family).toBe("Vaswani")
    expect(parsed?.issued).toEqual({ "date-parts": [[2017]] })
    expect(parsed?.DOI).toBe("10.48550/arXiv.1706.03762")
  })

  test("ris serialize then parse keeps key fields", async () => {
    const [parsed] = await parseRis(toRis(PAPER))
    expect(parsed?.title).toBe("Attention Is All You Need")
    expect(parsed?.author).toHaveLength(3)
    expect(parsed?.issued).toEqual({ "date-parts": [[2017]] })
    expect(parsed?.DOI).toBe("10.48550/arXiv.1706.03762")
  })
})
