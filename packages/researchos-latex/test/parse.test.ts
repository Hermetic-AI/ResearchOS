import { describe, expect, test } from "bun:test"
import { extractCiteKeys, parseBibtex } from "../src/bibtex"
import { parseOutline } from "../src/outline"

describe("parseBibtex", () => {
  test("parses entries with nested braces, quoted values, and comments", () => {
    const bib = [
      "% a comment line",
      "@article{vaswani2017attention,",
      "  title = {Attention Is {All} You Need},",
      "  author = \"Vaswani, Ashish and Shazeer, Noam\",",
      "  year = 2017,",
      "  doi = {10.48550/arXiv.1706.03762}",
      "}",
      "",
      "@inproceedings{devlin2018bert,",
      "  title = {BERT},",
      "  year = {2019}",
      "}",
    ].join("\n")
    const entries = parseBibtex(bib)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.type).toBe("article")
    expect(entries[0]?.key).toBe("vaswani2017attention")
    expect(entries[0]?.fields.title).toBe("Attention Is {All} You Need")
    expect(entries[0]?.fields.author).toBe("Vaswani, Ashish and Shazeer, Noam")
    expect(entries[0]?.fields.year).toBe("2017")
    expect(entries[1]?.key).toBe("devlin2018bert")
  })

  test("handles entries ending without trailing newline", () => {
    expect(parseBibtex("@article{a, title={T}, year={2020}}")).toHaveLength(1)
  })
})

describe("extractCiteKeys", () => {
  test("extracts keys from cite variants with optional args", () => {
    const keys = extractCiteKeys("\\cite{a,b} \\citep[see][pp. 2]{c} \\parencite{d}")
    expect(keys.sort()).toEqual(["a", "b", "c", "d"])
  })
})

describe("parseOutline", () => {
  test("returns levels, titles and line numbers", () => {
    const outline = parseOutline([
      "\\section{Introduction}",
      "text",
      "\\subsection{Background}",
      "\\subsubsection{Details}",
    ].join("\n"))
    expect(outline).toEqual([
      { level: 3, title: "Introduction", line: 1 },
      { level: 4, title: "Background", line: 3 },
      { level: 5, title: "Details", line: 4 },
    ])
  })
})
