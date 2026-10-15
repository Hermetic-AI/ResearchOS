import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { gzipSync } from "node:zlib"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createLatexMcpServer } from "../src/mcp"
import { buildDir } from "../src/paths"

const SYNCTEX_SAMPLE = [
  "SyncTeX Version:1",
  "Input:1:F:/proj/paper/main.tex",
  "{1",
  "[1,10:1000000,5000000",
  "}1",
].join("\n")

describe("researchos-latex MCP server", () => {
  let dir: string
  let client: Client
  let close: () => Promise<void>

  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await client.callTool({ name, arguments: args })
    const text = (result.content as Array<{ type: string; text: string }>).find((item) => item.type === "text")?.text
    return JSON.parse(text ?? "null")
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "latex-mcp-"))
    const { server } = createLatexMcpServer(dir, { RESEARCHOS_TECTONIC: join(dir, "no-binary"), PATH: join(dir, "empty") })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: "test-client", version: "0.1.0" })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    close = async () => {
      await client.close()
      await server.close()
    }
  })

  afterEach(async () => {
    await close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("lists the three contract tools", async () => {
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(["compile", "format_check", "synctex"])
  })

  test("compile returns honest unavailability when tectonic is missing", async () => {
    await writeFile(join(dir, "main.tex"), "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n")
    const result = await call("compile", { main_file: "main.tex" }) as { available: boolean; installHint?: string }
    expect(result.available).toBe(false)
    expect(result.installHint).toContain("RESEARCHOS_TECTONIC")
  })

  test("synctex forward maps through the build synctex file", async () => {
    await mkdir(buildDir(dir), { recursive: true })
    await writeFile(join(buildDir(dir), "main.synctex.gz"), gzipSync(Buffer.from(SYNCTEX_SAMPLE, "utf8")))
    const result = await call("synctex", { main_file: "main.tex", file: "main.tex", line: 10 }) as {
      found: boolean
      page?: number
      x?: number
    }
    expect(result.found).toBe(true)
    expect(result.page).toBe(1)
    expect(result.x).toBeCloseTo(1000000 / 65536, 3)
  })

  test("synctex reports missing build output honestly", async () => {
    const result = await call("synctex", { main_file: "main.tex", file: "main.tex", line: 1 }) as { found: boolean; reason?: string }
    expect(result.found).toBe(false)
    expect(result.reason).toContain("compile first")
  })

  test("format_check runs rules over the project", async () => {
    await writeFile(join(dir, "main.tex"), [
      "\\documentclass{article}",
      "\\begin{document}",
      "Citing \\cite{nope2020}.",
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n"))
    await writeFile(join(dir, "refs.bib"), "")
    const result = await call("format_check", { main_file: "main.tex" }) as { issues: Array<{ rule: string }> }
    expect(result.issues.some((issue) => issue.rule === "missing-cite-key")).toBe(true)
  })
})

