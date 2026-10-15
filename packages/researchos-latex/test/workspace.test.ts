import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { LatexStore, listSources, readBuildPdf, readSource, writeSource } from "../src"

const roots: string[] = []

afterEach(async () => {
  await Bun.sleep(20)
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }))
})

function project() {
  const root = join(import.meta.dir, `.tmp-workspace-${crypto.randomUUID()}`)
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

describe("LaTeX workspace", () => {
  test("lists, writes, and parses project sources", async () => {
    const root = project()
    await writeSource(root, "paper/main.tex", "\\section{Method}\nText")
    await writeSource(root, "refs.bib", "@article{demo, title={Demo}}")

    expect(await listSources(root)).toEqual(["paper/main.tex", "refs.bib"])
    expect(readSource(root, "paper/main.tex").outline).toEqual([{ level: 3, title: "Method", line: 1 }])
    expect(readSource(root, "refs.bib").bibliography[0]?.key).toBe("demo")
  })

  test("rejects paths outside the project and unsupported extensions", async () => {
    const root = project()
    expect(() => readSource(root, "../outside.tex")).toThrow("escapes project root")
    expect(() => readSource(root, "notes.md")).toThrow("Unsupported source extension")
  })

  test("reads only the conventional compiled PDF", async () => {
    const root = project()
    await writeSource(root, "main.tex", "\\documentclass{article}")
    mkdirSync(join(root, ".researchos", "latex", "build"), { recursive: true })
    await Bun.write(join(root, ".researchos", "latex", "build", "main.pdf"), new Uint8Array([37, 80, 68, 70]))
    expect(readBuildPdf(root, "main.tex").data).toBe("JVBERg==")
  })
})

describe("LaTeX history", () => {
  test("persists build metadata", () => {
    const root = project()
    const store = new LatexStore(root)
    store.recordBuild({ mainFile: "main.tex", status: "success", pdfPath: "build/main.pdf", log: "ok", durationMs: 20 })
    expect(store.listBuilds()).toMatchObject([{ mainFile: "main.tex", status: "success", durationMs: 20 }])
    store.close()
  })
})
