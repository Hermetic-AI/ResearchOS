import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createGraphMcpServer } from "../src/mcp"

const DIMS = 384

function vector(words: string[]): number[] {
  const vec = new Array<number>(DIMS).fill(0)
  words.forEach((word) => {
    vec[Array.from(word).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0) % DIMS] = 1
  })
  return vec
}

const fakeEmbedder = (texts: string[]) => Promise.resolve(texts.map((text) => vector(text.toLowerCase().match(/[a-z]+/g) ?? [])))

describe("researchos-graph MCP server", () => {
  let dir: string
  let client: Client
  let close: () => Promise<void>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-mcp-"))
    const { server, repository } = await createGraphMcpServer(dir, null)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: "test-client", version: "0.1.0" })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    close = async () => {
      await client.close()
      await server.close()
      await repository.close()
    }
  })

  afterEach(async () => {
    await close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("lists the four contract tools", async () => {
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(["layout", "parse_wikilinks", "query", "upsert"])
  })

  test("parse_wikilinks then layout roundtrip", async () => {
    await mkdir(join(dir, "notes"), { recursive: true })
    await writeFile(join(dir, "notes", "a.md"), "Links to [[Attention Mechanism]] and [[FlashAttention]].")
    const parsed = await call(client, "parse_wikilinks", { paths: ["notes/a.md"] }) as {
      files: Array<{ path: string; nodes: number; edges: number }>
    }
    expect(parsed.files[0]?.nodes).toBe(3)
    expect(parsed.files[0]?.edges).toBe(2)

    const layout = await call(client, "layout", {}) as { nodes: Array<{ id: string }>; edges: Array<{ relation: string }> }
    expect(layout.nodes.map((node) => node.id).sort()).toEqual([
      "concept:attention-mechanism",
      "concept:flashattention",
      "note:notes/a.md",
    ])
    expect(layout.edges).toHaveLength(2)
  })

  test("upsert then query returns subgraph with FTS-degraded recall", async () => {
    await call(client, "upsert", {
      nodes: [
        { id: "paper:p1", type: "paper", label: "Attention Is All You Need" },
        { id: "concept:attention", type: "concept", label: "Attention Mechanism" },
      ],
      edges: [{ from: "paper:p1", to: "concept:attention", relation: "mentions", context: "attention is all you need" }],
    })
    const result = await call(client, "query", { question: "attention", scope: { depth: 1 } }) as {
      seeds: Array<{ id: string }>
      subgraph: { nodes: Array<{ id: string }>; edges: Array<{ context?: string }> }
      contextPack: string
      degraded: boolean
    }
    expect(result.degraded).toBe(true)
    expect(result.seeds.map((seed) => seed.id)).toContain("concept:attention")
    expect(result.subgraph.nodes.map((node) => node.id)).toContain("paper:p1")
    expect(result.contextPack).toContain("attention is all you need")
  })

  test("parse_wikilinks rejects paths escaping the project root", async () => {
    const result = await client.callTool({ name: "parse_wikilinks", arguments: { paths: ["../outside.md"] } })
    expect(result.isError).toBe(true)
  })
})

describe("researchos-graph MCP vector recall", () => {
  let dir: string
  let client: Client
  let vecAvailable: boolean
  let close: () => Promise<void>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-mcp-vec-"))
    const { server, repository } = await createGraphMcpServer(dir, fakeEmbedder)
    vecAvailable = repository.vecAvailable ?? false
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: "test-client", version: "0.1.0" })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    close = async () => {
      await client.close()
      await server.close()
      await repository.close()
    }
  })

  afterEach(async () => {
    await close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("upsert embeds nodes and query recalls them via KNN", async () => {
    if (!vecAvailable) {
      console.warn("sqlite-vec unavailable; skipping vector recall assertions")
      return
    }
    await call(client, "upsert", {
      nodes: [
        { id: "concept:quantum-computing", type: "concept", label: "Quantum Computing" },
        { id: "concept:attention-mechanism", type: "concept", label: "Attention Mechanism" },
      ],
      edges: [],
    })
    const result = await call(client, "query", { question: "quantum computing" }) as {
      seeds: Array<{ id: string }>
      degraded: boolean
    }
    expect(result.degraded).toBe(false)
    expect(result.seeds[0]?.id).toBe("concept:quantum-computing")
  })
})

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as Array<{ type: string; text: string }>).find((item) => item.type === "text")?.text
  return JSON.parse(text ?? "null")
}
