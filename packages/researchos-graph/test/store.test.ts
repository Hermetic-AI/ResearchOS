import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { SqliteStore } from "../src/store"
import type { GraphNode } from "../src/types"

function node(id: string, type: GraphNode["type"], label: string, extras: Partial<GraphNode> = {}): GraphNode {
  return { id, type, label, refId: null, sourcePath: null, attrs: {}, x: null, y: null, ...extras }
}

describe("SqliteStore", () => {
  let dir: string
  let store: SqliteStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graph-store-"))
    store = new SqliteStore(dir)
  })

  afterEach(async () => {
    store.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("upsert is idempotent and merges labels/attrs", () => {
    store.upsertNodes([node("concept:attention", "concept", "Attention")])
    store.upsertNodes([node("concept:transformer", "concept", "Transformer")])
    store.upsertEdges([{ from: "concept:attention", to: "concept:transformer", relation: "mentions", context: "ctx", sourcePath: "notes/a.md" }])
    store.upsertNodes([node("concept:attention", "concept", "Attention Mechanism", { attrs: { year: 2017 } })])
    store.upsertEdges([{ from: "concept:attention", to: "concept:transformer", relation: "mentions", context: "ctx", sourcePath: "notes/a.md" }])

    expect(store.getNode("concept:attention")?.label).toBe("Attention Mechanism")
    expect(store.getNode("concept:attention")?.attrs).toEqual({ year: 2017 })
    expect(store.all().edges).toHaveLength(1)
  })

  test("replaceBySource recycles removed links but keeps shared nodes", () => {
    const first = {
      nodes: [
        node("note:notes/a.md", "note", "A", { sourcePath: "notes/a.md" }),
        node("concept:x", "concept", "X"),
        node("concept:y", "concept", "Y"),
      ],
      edges: [
        { from: "note:notes/a.md", to: "concept:x", relation: "mentions" as const, context: null, sourcePath: "notes/a.md" },
        { from: "note:notes/a.md", to: "concept:y", relation: "mentions" as const, context: null, sourcePath: "notes/a.md" },
      ],
    }
    store.replaceBySource("notes/a.md", first)
    // concept:y 同时被另一个文件引用，重解析 a.md 后仍保留
    store.upsertNodes([node("note:notes/b.md", "note", "B", { sourcePath: "notes/b.md" })])
    store.upsertEdges([{ from: "note:notes/b.md", to: "concept:y", relation: "mentions", context: null, sourcePath: "notes/b.md" }])

    store.replaceBySource("notes/a.md", {
      nodes: [node("note:notes/a.md", "note", "A", { sourcePath: "notes/a.md" })],
      edges: [],
    })
    expect(store.getNode("concept:x")).toBeNull()
    expect(store.getNode("concept:y")).not.toBeNull()
    expect(store.all().edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(["note:notes/b.md->concept:y"])
  })

  test("deleting a node cascades its edges", () => {
    store.replaceBySource("notes/a.md", {
      nodes: [node("note:notes/a.md", "note", "A", { sourcePath: "notes/a.md" }), node("concept:x", "concept", "X")],
      edges: [{ from: "note:notes/a.md", to: "concept:x", relation: "mentions", context: null, sourcePath: "notes/a.md" }],
    })
    store.removeBySource("notes/a.md")
    expect(store.all()).toEqual({ nodes: [], edges: [] })
  })

  test("FTS search recalls nodes by label and attr text", () => {
    store.upsertNodes([
      node("paper:p1", "paper", "Attention Is All You Need", { attrs: { doi: "10.48550/arXiv.1706.03762" } }),
      node("concept:quantum", "concept", "Quantum Computing"),
    ])
    expect(store.search("attention", 8).map((hit) => hit.id)).toEqual(["paper:p1"])
    expect(store.search("quantum", 8).map((hit) => hit.id)).toEqual(["concept:quantum"])
    expect(store.search("!!!", 8)).toEqual([])
  })

  test("neighbors respects hop depth", () => {
    const ids = ["n0", "n1", "n2", "n3"]
    store.upsertNodes(ids.map((id) => node(`concept:${id}`, "concept", id.toUpperCase())))
    const chain = ids.slice(0, -1).map((id, i) => ({
      from: `concept:${id}`,
      to: `concept:${ids[i + 1]}`,
      relation: "mentions" as const,
      context: null,
      sourcePath: null,
    }))
    store.upsertEdges(chain)

    const one = store.neighbors("concept:n0", 1)
    expect(one.nodes.map((n) => n.id).sort()).toEqual(["concept:n0", "concept:n1"])
    const two = store.neighbors("concept:n0", 2)
    expect(two.nodes.map((n) => n.id).sort()).toEqual(["concept:n0", "concept:n1", "concept:n2"])
    expect(two.edges).toHaveLength(2)
  })

  test("saveLayout persists coordinates", () => {
    store.upsertNodes([node("concept:x", "concept", "X")])
    store.saveLayout([{ id: "concept:x", x: 12.5, y: -7 }])
    expect(store.getNode("concept:x")?.x).toBe(12.5)
    expect(store.getNode("concept:x")?.y).toBe(-7)
  })

  test("type filter limits nodes and drops dangling edges", () => {
    store.upsertNodes([node("paper:p1", "paper", "P"), node("concept:c1", "concept", "C")])
    store.upsertEdges([{ from: "paper:p1", to: "concept:c1", relation: "mentions", context: null, sourcePath: null }])
    const papers = store.all({ type: "paper" })
    expect(papers.nodes).toHaveLength(1)
    expect(papers.edges).toHaveLength(0)
  })
})
