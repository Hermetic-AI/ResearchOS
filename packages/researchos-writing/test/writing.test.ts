import { describe, test, expect } from "bun:test"
import { csvToLatex, mdToLatex, codeToAlgorithm } from "../src/convert"
import { rewrite } from "../src/rewrite"

describe("csvToLatex", () => {
  test("converts CSV to booktabs LaTeX table", () => {
    const csv = "Name,Year\nAttention Is All You Need,2017\nBERT,2018"
    const result = csvToLatex(csv, "Table Caption", "tab:papers")
    expect(result).toContain("\\caption{Table Caption}")
    expect(result).toContain("\\label{tab:papers}")
    expect(result).toContain("Attention Is All You Need")
    expect(result).toContain("\\toprule")
  })
})

describe("mdToLatex", () => {
  test("converts headings", () => {
    expect(mdToLatex("# Title")).toContain("\\section*{Title}")
    expect(mdToLatex("## Section")).toContain("\\subsection*{Section}")
  })

  test("converts bold and italic", () => {
    expect(mdToLatex("**bold**")).toContain("\\textbf{bold}")
    expect(mdToLatex("*italic*")).toContain("\\textit{italic}")
  })
})

describe("codeToAlgorithm", () => {
  test("converts code to algorithmic block", () => {
    const code = `x = 1\nif x > 0\n  y = 2\nreturn y`
    const result = codeToAlgorithm(code)
    expect(result).toContain("\\begin{algorithm}")
    expect(result).toContain("\\end{algorithmic}")
  })
})

describe("rewrite", () => {
  test("academic style replaces informal language", () => {
    const r = rewrite("we don't know", "academic")
    expect(r).not.toContain("don't")
  })

  test("concise style removes filler", () => {
    const r = rewrite("in order to test", "concise")
    expect(r).toContain("to test")
    expect(r).not.toContain("in order to")
  })

  test("passive style converts active voice", () => {
    const r = rewrite("we measured X", "passive")
    expect(r).toContain("X was measured")
  })
})
