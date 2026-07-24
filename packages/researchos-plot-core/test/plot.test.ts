import { describe, test, expect } from "bun:test"
import { JournalThemes, mermaidToSvg, graphvizToSvg, insertToPaper } from "../src/plot"

describe("JournalThemes", () => {
  test("has all journal themes", () => {
    expect(JournalThemes.nature).toBeDefined()
    expect(JournalThemes.science).toBeDefined()
    expect(JournalThemes.ieee).toBeDefined()
    expect(JournalThemes.prism).toBeDefined()
    expect(JournalThemes.nature.palette.length).toBe(5)
  })
})

describe("mermaidToSvg", () => {
  test("returns SVG stub", () => {
    const svg = mermaidToSvg("graph TD; A-->B;")
    expect(svg).toContain("<svg>")
  })
})

describe("graphvizToSvg", () => {
  test("returns DOT SVG stub", () => {
    expect(graphvizToSvg("digraph { a -> b }")).toContain("<svg>")
  })
})

describe("insertToPaper", () => {
  test("generates LaTeX figure block", () => {
    const latex = insertToPaper("chart-001", "3.2")
    expect(latex).toContain("\\begin{figure}")
    expect(latex).toContain("chart-001")
    expect(latex).toContain("section 3.2")
  })
})
