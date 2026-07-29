import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { DataStore } from "../src/db"
import { artifactsDir } from "../src/paths"

describe("DataStore", () => {
  let dir: string
  let store: DataStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "data-store-"))
    store = new DataStore(dir)
  })

  afterEach(async () => {
    store.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("runs DDL idempotently across instances", () => {
    store.close()
    const again = new DataStore(dir)
    again.close()
    store = new DataStore(dir)
  })

  test("registers datasets idempotently by path and caches profile", () => {
    const first = store.registerDataset({ name: "results", path: ".researchos/datasets/results.csv", format: "csv", sizeBytes: 100 })
    const second = store.registerDataset({ name: "results", path: ".researchos/datasets/results.csv", format: "csv", sizeBytes: 100, profileJson: "{\"schema\":[]}" })
    expect(second.id).toBe(first.id)
    expect(store.listDatasets()).toHaveLength(1)
    expect(store.getDataset(first.id)?.profileJson).toBe("{\"schema\":[]}")
  })

  test("persists notebook cells and execution output", () => {
    const notebook = store.ensureNotebook()
    const cell = store.createCell({ notebookId: notebook.id, source: "value = 40" })
    store.updateCellSource(cell.id, "value = 42\nprint(value)")
    const executed = store.recordCellRun(cell.id, { status: "success", stdout: "42\n", stderr: "", durationMs: 8 })
    expect(store.ensureNotebook().id).toBe(notebook.id)
    expect(store.listCells(notebook.id)).toHaveLength(1)
    expect(executed).toMatchObject({ source: "value = 42\nprint(value)", stdout: "42\n", status: "success" })
  })

  test("registers artifacts and resolves them by path", () => {
    const artifact = store.registerArtifact({
      kind: "chart",
      path: "art_1.pdf",
      previewPath: "art_1.svg",
      format: "pdf",
      dpi: 300,
      latexSnippet: "\\begin{figure}\\end{figure}",
      specJson: "{\"kind\":\"line\"}",
    })
    expect(store.getArtifactByPath("art_1.pdf")?.id).toBe(artifact.id)
    expect(store.listArtifacts()).toHaveLength(1)
  })

  test("link upserts and reports missing tex sections as warning", async () => {
    const artifact = store.registerArtifact({ kind: "chart", path: "a.pdf", format: "pdf" })
    await writeFile(join(dir, "main.tex"), "\\section{Experiments}\\label{sec:experiments}\n")
    const linked = store.linkArtifact({ artifactId: artifact.id, texFile: "main.tex", texSection: "sec:experiments" })
    expect(linked.warning).toBeUndefined()
    const warned = store.linkArtifact({ artifactId: artifact.id, texFile: "main.tex", texSection: "sec:missing" })
    expect(warned.warning).toContain("sec:missing")
    const missing = store.linkArtifact({ artifactId: artifact.id, texFile: "main.tex", texSection: "sec:experiments" })
    expect(missing.ok).toBe(true)
    expect(store.listLinks(artifact.id)).toHaveLength(2)
    expect(() => store.linkArtifact({ artifactId: "art_nope" })).toThrow(/Unknown artifact/)
  })

  test("rejects tex files outside the project root as warning", () => {
    const artifact = store.registerArtifact({ kind: "chart", path: "a.pdf", format: "pdf" })
    const result = store.linkArtifact({ artifactId: artifact.id, texFile: "../outside.tex", texSection: "x" })
    expect(result.warning).toContain("escapes project root")
  })

  test("records and lists stat tests", () => {
    const row = store.recordStatTest({ test: "ttest", columnsJson: "[\"a\",\"b\"]", statistic: 2.5, pValue: 0.02, conclusion: "显著" })
    expect(row.test).toBe("ttest")
    expect(store.listStatTests()).toHaveLength(1)
    expect(store.listStatTests()[0]?.pValue).toBeCloseTo(0.02)
  })

  test("reads artifact bytes from the artifacts dir only", async () => {
    await mkdir(artifactsDir(dir), { recursive: true })
    await writeFile(join(artifactsDir(dir), "ok.svg"), "<svg/>")
    const artifact = store.registerArtifact({ kind: "chart", path: "ok.svg", format: "svg" })
    const file = store.readArtifactFile(artifact.id)
    expect(new TextDecoder().decode(file.content)).toBe("<svg/>")

    const evil = store.registerArtifact({ kind: "chart", path: "../outside.svg", format: "svg" })
    expect(() => store.readArtifactFile(evil.id)).toThrow(/escapes artifacts dir/)
  })

  test("meta roundtrip", () => {
    expect(store.getMeta("sandbox")).toBeNull()
    store.setMeta("sandbox", "ready")
    expect(store.getMeta("sandbox")).toBe("ready")
    store.setMeta("sandbox", "py3.12")
    expect(store.getMeta("sandbox")).toBe("py3.12")
  })
})
