import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { Plugin } from "@opencode/plugin"
import writing from "../src/index"

type AddedTool = {
  readonly name: string
  readonly execute: (input: Record<string, unknown>, context: unknown) => Promise<{ content: string }>
}

async function register(directory: string) {
  const added: Array<AddedTool> = []
  const context = {
    location: { directory },
    tool: {
      transform: async (callback: (editor: { add(tool: AddedTool): void }) => void) => callback({ add: (tool) => added.push(tool) }),
    },
  }
  await writing.setup(context as unknown as Plugin.Context)
  return Object.fromEntries(added.map((tool) => [tool.name, tool])) as Record<string, AddedTool>
}

describe("writing plugin tools", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "writing-plugin-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("registers the five writing tools", async () => {
    expect(writing.id).toBe("researchos.writing")
    expect(Object.keys(await register(dir)).sort()).toEqual([
      "bibtex_from_library",
      "bibtex_upsert",
      "md_to_latex",
      "suggest_record",
      "table_to_latex",
    ])
  })

  test("table_to_latex converts a real CSV file", async () => {
    await writeFile(join(dir, "results.csv"), "Model,Score\nOurs,0.9\n")
    const tools = await register(dir)
    const result = await tools.table_to_latex.execute({ file: "results.csv" }, {})
    expect(result.content).toContain("Ours & 0.9 \\\\")
  })

  test("bibtex_upsert appends new keys and skips duplicates", async () => {
    await writeFile(join(dir, "refs.bib"), "@article{a2020one,\n  title = {One}\n}\n")
    const tools = await register(dir)
    const result = await tools.bibtex_upsert.execute(
      {
        bib_file: "refs.bib",
        entries: [
          { key: "a2020one", bibtex: "@article{a2020one,\n  title = {Dup}\n}" },
          { key: "b2021two", bibtex: "@article{b2021two,\n  title = {Two}\n}" },
        ],
      },
      {},
    )
    expect(JSON.parse(result.content)).toEqual({ inserted: ["b2021two"], skipped: ["a2020one"] })
  })

  test("suggest_record persists and returns an id", async () => {
    const tools = await register(dir)
    const result = await tools.suggest_record.execute(
      {
        kind: "title",
        input_excerpt: "An abstract about attention.",
        output: '["Attention Revisited"]',
        status: "pending",
      },
      {},
    )
    expect((JSON.parse(result.content) as { id: string }).id.length).toBeGreaterThan(0)
  })

  test("tools reject paths escaping the project root", async () => {
    const tools = await register(dir)
    await expect(tools.md_to_latex.execute({ file: "../outside.md" }, {})).rejects.toThrow(/escapes project root/)
  })
})
