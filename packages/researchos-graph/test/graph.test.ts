import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { GraphDB } from "../src/db"
import { parseWikilinks, computeLayout } from "../src/parse"
import { graphRagQuery } from "../src/query"

function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "graph-test-"))
}

describe("parseWikilinks", () => {
  test("parses [[wikilink]] as concept mention", () => {
    const content = "See [[Transformer]] and [[Attention Mechanism]] for details."
    const { nodes, edges } = parseWikilinks(content, "notes/test.md")
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    const conceptIds = nodes.filter((n) => n.type === "concept").map((n) => n.id)
    expect(conceptIds).toContain("concept:transformer")
    expect(conceptIds).toContain("concept:attention mechanism")
  })

  test("parses [[DOI]] as paper cite", () => {
    const content = "As shown in [[10.48550/arXiv.1706.03762]]"
    const { edges } = parseWikilinks(content, "notes/test.md")
    const cites = edges.filter((e) => e.relation === "cites")
    expect(cites.length).toBeGreaterThan(0)
  })

  test("parses \\cite{} references", () => {
    const content = "\\cite{vaswani2017attention,devlin2018bert}"
    const { edges } = parseWikilinks(content, "notes/test.md")
    const cites = edges.filter((e) => e.relation === "cites")
    expect(cites.length).toBe(2)
  })
})

describe("computeLayout", () => {
  test("computes positions for all nodes", () => {
    const nodes = [
      { id: "n1", type: "paper" as const, label: "A", x: 0, y: 0 },
      { id: "n2", type: "paper" as const, label: "B", x: 0, y: 0 },
      { id: "n3", type: "concept" as const, label: "C", x: 0, y: 0 },
    ]
    const edges = [
      { from: "n1", to: "n2", relation: "cites" as const },
      { from: "n2", to: "n3", relation: "mentions" as const },
    ]
    const result = computeLayout(nodes, edges)
    expect(result.length).toBe(3)
    for (const n of result) {
      expect(typeof n.x).toBe("number")
      expect(typeof n.y).toBe("number")
    }
  })
})

describe("GraphDB", () => {
  let db: GraphDB
  let dir: string

  beforeEach(async () => {
    dir = await tmpDir()
    db = new GraphDB(dir)
    await db.init()
  })

  afterEach(() => {
    db.close()
    rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("upserts and retrieves nodes", () => {
    db.upsertNodes([
      { id: "paper:1", type: "paper", label: "Test Paper", x: 0, y: 0 },
      { id: "concept:test", type: "concept", label: "Test Concept", x: 0, y: 0 },
    ])
    const node = db.getNode("paper:1")
    expect(node).not.toBeNull()
    expect(node!.label).toBe("Test Paper")
  })

  test("upserts edges and gets neighbors", () => {
    db.upsertNodes([
      { id: "n1", type: "paper", label: "P1", x: 0, y: 0 },
      { id: "n2", type: "paper", label: "P2", x: 0, y: 0 },
      { id: "n3", type: "concept", label: "C1", x: 0, y: 0 },
    ])
    db.upsertEdges([
      { from: "n1", to: "n2", relation: "cites" },
      { from: "n1", to: "n3", relation: "mentions" },
    ])
    const neighbors = db.getNeighbors("n1")
    expect(neighbors.nodes.length).toBe(3)
    expect(neighbors.edges.length).toBe(2)
  })

  test("getAll returns all nodes and edges", () => {
    db.upsertNodes([{ id: "n1", type: "paper", label: "P1", x: 0, y: 0 }])
    db.upsertEdges([{ from: "n1", to: "n2", relation: "cites" }])
    const all = db.getAll()
    expect(all.nodes.length).toBeGreaterThanOrEqual(1)
    expect(all.edges.length).toBeGreaterThanOrEqual(1)
  })
})

describe("graphRagQuery", () => {
  test("generates answer with subgraph summary", () => {
    const nodes = [{ id: "n1", type: "paper" as const, label: "Test", x: 0, y: 0 }]
    const edges = [] as Array<{ from: string; to: string; relation: "cites" }>
    const result = graphRagQuery("test query", { nodes, edges })
    expect(result.answer).toContain("test query")
    expect(result.subgraph.nodes.length).toBe(1)
  })
})
