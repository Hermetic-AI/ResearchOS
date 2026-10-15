import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { PluginInput, ToolContext } from "@opencode/plugin"
import WritingPluginDefault, { WritingPlugin } from "../src/index"

function fakeContext(directory: string): ToolContext {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => Promise.resolve(),
  }
}

describe("WritingPlugin tools", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "writing-plugin-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("default export is a PluginModule and registers five tools", async () => {
    expect(WritingPluginDefault.id).toBe("researchos-writing")
    const hooks = await WritingPlugin({} as PluginInput)
    expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
      "bibtex_from_library",
      "bibtex_upsert",
      "md_to_latex",
      "suggest_record",
      "table_to_latex",
    ])
  })

  test("table_to_latex converts a real CSV file", async () => {
    await writeFile(join(dir, "results.csv"), "Model,Score\nOurs,0.9\n")
    const hooks = await WritingPlugin({} as PluginInput)
    const tool = hooks.tool?.table_to_latex
    const result = await tool?.execute({ file: "results.csv" }, fakeContext(dir))
    expect(typeof result === "object" && result.output).toContain("Ours & 0.9 \\\\")
  })

  test("bibtex_upsert appends new keys and skips duplicates", async () => {
    await writeFile(join(dir, "refs.bib"), "@article{a2020one,\n  title = {One}\n}\n")
    const hooks = await WritingPlugin({} as PluginInput)
    const tool = hooks.tool?.bibtex_upsert
    const result = await tool?.execute({
      bib_file: "refs.bib",
      entries: [
        { key: "a2020one", bibtex: "@article{a2020one,\n  title = {Dup}\n}" },
        { key: "b2021two", bibtex: "@article{b2021two,\n  title = {Two}\n}" },
      ],
    }, fakeContext(dir))
    expect(typeof result === "object" && result.output).toBe(JSON.stringify({ inserted: ["b2021two"], skipped: ["a2020one"] }))
  })

  test("suggest_record persists and returns an id", async () => {
    const hooks = await WritingPlugin({} as PluginInput)
    const tool = hooks.tool?.suggest_record
    const result = await tool?.execute({
      kind: "title",
      input_excerpt: "An abstract about attention.",
      output: "[\"Attention Revisited\"]",
      status: "pending",
    }, fakeContext(dir))
    const parsed = JSON.parse(typeof result === "object" ? result.output : "") as { id: string }
    expect(parsed.id.length).toBeGreaterThan(0)
  })

  test("tools reject paths escaping the project root", async () => {
    const hooks = await WritingPlugin({} as PluginInput)
    const tool = hooks.tool?.md_to_latex
    await expect(tool?.execute({ file: "../outside.md" }, fakeContext(dir))).rejects.toThrow(/escapes project root/)
  })
})
