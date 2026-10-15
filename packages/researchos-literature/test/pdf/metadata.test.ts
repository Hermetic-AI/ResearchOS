import { describe, expect, test } from "bun:test"
import { findArxivId, findDoi, parsePdfMetadata } from "../../src/pdf/metadata"

describe("parsePdfMetadata", () => {
  const firstPage = [
    "PROCEEDINGS OF THE 35TH CONFERENCE ON NEURAL INFORMATION PROCESSING",
    "Attention Is All You Need",
    "Ashish Vaswani, Noam Shazeer, Niki Parmar",
    "Google Brain",
    "arXiv:1706.03762v5",
    "doi: 10.48550/arXiv.1706.03762",
    "2017",
  ].join("\n")

  test("extracts DOI and strips trailing punctuation", () => {
    expect(findDoi("see (doi: 10.1000/journal.xyz).")).toBe("10.1000/journal.xyz")
    expect(parsePdfMetadata(firstPage).doi).toBe("10.48550/arXiv.1706.03762")
  })

  test("extracts arXiv ID, prefixed or bare", () => {
    expect(findArxivId("arXiv:1706.03762v5")).toBe("1706.03762v5")
    expect(findArxivId("preprint 2401.00001 available")).toBe("2401.00001")
    // 不应从 DOI 内部切出裸 ID
    expect(findArxivId("10.48550/arXiv.1706.03762")).toBeNull()
  })

  test("picks the longest non-author line as title candidate", () => {
    expect(parsePdfMetadata(firstPage).title).toBe("Attention Is All You Need")
  })

  test("extracts year from first page", () => {
    expect(parsePdfMetadata(firstPage).year).toBe(2017)
  })

  test("returns nulls on empty text", () => {
    expect(parsePdfMetadata("")).toEqual({ doi: null, arxivId: null, title: null, year: null })
  })
})
