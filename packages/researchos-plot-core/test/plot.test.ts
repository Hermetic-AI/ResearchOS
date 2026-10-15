import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  ChartSpec,
  editDiagram,
  JournalThemes,
  PlotStore,
  includeGraphicsSnippet,
  insertArtifactToPaper,
  mergeChartSpec,
  pValueToStars,
  persistGraphviz,
  persistMermaid,
  renderGraphviz,
  saveDiagram,
  tikzExport,
  validateMermaid,
} from "../src"

const root = mkdtempSync(join(tmpdir(), "researchos-plot-core-"))
afterAll(async () => {
  await Bun.sleep(500)
  rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
})

const spec = ChartSpec.parse({
  template: "grouped_bar",
  data: { inline: [{ group: "A", value: 1 }] },
  encoding: { x: "group", y: "value", error: "sem" },
})

describe("plugin renderers", () => {
  test("validates Mermaid and rejects broken syntax", async () => {
    expect(await validateMermaid("flowchart TD\nA --> B")).toBeTruthy()
    expect(validateMermaid("flowchart TD\nA -->")).rejects.toThrow()
  })

  test("renders Graphviz DOT through WASM", async () => {
    expect(await renderGraphviz("digraph { a -> b }", "dot")).toContain("<svg")
  })

  test("persists diagram artifacts and inserts them into a paper", async () => {
    const mermaid = await persistMermaid(root, { code: "flowchart TD\nA --> B", name: "flow" })
    const graphviz = await persistGraphviz(root, { dot: "digraph { a -> b }", name: "graph" })
    const store = new PlotStore(root)
    expect(store.listArtifacts().map((artifact) => artifact.id)).toContain(mermaid.artifactId)
    expect(new TextDecoder().decode(store.readArtifact(graphviz.artifactId).content)).toContain("<svg")
    store.close()
    writeFileSync(join(root, "paper.tex"), "\\section{Results}\n")
    const inserted = insertArtifactToPaper(root, {
      artifact_path: graphviz.artifactPath,
      tex_file: "paper.tex",
      section: "Results",
      caption: "Model & result",
    })
    expect(inserted.latexSnippet).toContain("\\caption{Model \\& result}")
  })

  test("atomically saves validated draw.io XML inside the project", async () => {
    const diagram = editDiagram(root, { action: "create", file: "editable" })
    const xml = '<mxfile host="ResearchOS"><diagram name="Page-1"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>'
    expect(saveDiagram(root, { file: diagram.file, xml })).toEqual({ file: diagram.file })
    expect(readFileSync(join(root, diagram.file), "utf8")).toBe(xml)
    expect(() => saveDiagram(root, { file: diagram.file, xml: "<html/>" })).toThrow("invalid draw.io XML")
    expect(() => saveDiagram(root, { file: "../outside.drawio", xml })).toThrow()
  })
})

describe("ChartSpec", () => {
  test("fills publication defaults and deep-merges patches", () => {
    expect(spec.theme).toBe("nature")
    expect(spec.axes.tick_font_size).toBe(7)
    expect(mergeChartSpec(spec, { axes: { y_label: "Response" } }).axes).toEqual({
      tick_font_size: 7,
      y_label: "Response",
    })
  })

  test("rejects unsupported templates", () => {
    expect(() => ChartSpec.parse({ ...spec, template: "pie" })).toThrow()
  })
})

describe("publication helpers", () => {
  test("maps strict p-value boundaries", () => {
    expect([0.05, 0.049, 0.01, 0.009, 0.001, 0.0009].map(pValueToStars)).toEqual([
      "ns",
      "*",
      "*",
      "**",
      "**",
      "***",
    ])
  })

  test("generates safe LaTeX and TikZ bridges", () => {
    const latex = includeGraphicsSnippet({ path: "figures/result.pdf", caption: "A & B" })
    expect(latex).toContain("\\caption{A \\& B}")
    expect(latex).toContain("\\label{fig:result}")
    expect(tikzExport(spec)).toContain("\\begin{axis}")
    expect(JournalThemes.ieee.palette[0]).toBe("#111111")
  })
})
