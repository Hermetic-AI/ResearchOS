import { describe, expect, test } from "bun:test"
import { parseFile } from "../src/wikilink"
import type { GraphNode } from "../src/types"

const RESOLVER = (key: string) =>
  key === "vaswani2017attention"
    ? { nodeId: "paper:10-48550-arxiv-1706-03762", refId: "lit-001", label: "Attention Is All You Need" }
    : undefined

describe("parseFile markdown", () => {
  test("parses plain, aliased and heading wikilinks, deduping repeated targets", () => {
    const parsed = parseFile({
      path: "notes/survey.md",
      content: [
        "# Survey",
        "",
        "Transformers build on [[Attention Mechanism]] and [[attention mechanism|the attention op]].",
        "See also [[FlashAttention#v2]] for the kernel details.",
      ].join("\n"),
    })
    const self = parsed.nodes.find((node) => node.id === "note:notes/survey.md")
    expect(self?.type).toBe("note")
    const concepts = parsed.nodes.filter((node) => node.type === "concept")
    expect(concepts.map((node) => node.id).sort()).toEqual(["concept:attention-mechanism", "concept:flashattention"])
    expect(parsed.edges).toHaveLength(2)
    expect(parsed.edges.every((edge) => edge.relation === "mentions")).toBe(true)
    expect(parsed.edges.every((edge) => edge.from === "note:notes/survey.md")).toBe(true)
    expect(parsed.edges[0]?.context?.length ?? 0).toBeLessThanOrEqual(200)
  })

  test("paper notes cite paper targets and resolve bibkeys via citeKeyToPaperId", () => {
    const parsed = parseFile({
      path: "papers/transformer.md",
      content: [
        "---",
        "title: Attention Is All You Need",
        "doi: 10.48550/arXiv.1706.03762",
        "---",
        "",
        "Builds on [[vaswani2017attention]] and the raw DOI link [[10.1145/3442188.3445922]].",
      ].join("\n"),
      citeKeyToPaperId: RESOLVER,
    })
    const self = parsed.nodes.find((node) => node.id === "paper:10-48550-arxiv-1706-03762")
    expect(self?.type).toBe("paper")
    expect(self?.label).toBe("Attention Is All You Need")
    const doiTarget = parsed.nodes.find((node) => node.id === "paper:10-1145-3442188-3445922")
    expect(doiTarget?.type).toBe("paper")
    expect(parsed.edges).toHaveLength(2)
    expect(parsed.edges.every((edge) => edge.relation === "cites")).toBe(true)
  })

  test("prefers existing concept and note nodes over creating new concepts", () => {
    const known: Record<string, GraphNode> = {
      "concept:transformer": {
        id: "concept:transformer", type: "concept", label: "Transformer", refId: null, sourcePath: null, attrs: {}, x: null, y: null,
      },
      "note:notes/attention.md": {
        id: "note:notes/attention.md", type: "note", label: "Attention", refId: null, sourcePath: null, attrs: {}, x: null, y: null,
      },
    }
    const parsed = parseFile({
      path: "notes/a.md",
      content: "Links to [[Transformer]] and [[notes/attention.md]].",
      existingNode: (id) => known[id] ?? null,
    })
    const targets = parsed.edges.map((edge) => edge.to).sort()
    expect(targets).toEqual(["concept:transformer", "note:notes/attention.md"])
  })

  test("returns just the self node when no links exist", () => {
    const parsed = parseFile({ path: "notes/plain.md", content: "No links here." })
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.edges).toHaveLength(0)
  })
})

describe("parseFile latex", () => {
  test("extracts \\cite keys, resolves them, and skips unresolved keys", () => {
    const parsed = parseFile({
      path: "papers/main.tex",
      content: "As shown in \\cite{vaswani2017attention, unknownkey2020} the model...",
      citeKeyToPaperId: RESOLVER,
    })
    expect(parsed.nodes.map((node) => node.id).sort()).toEqual([
      "note:papers/main.tex",
      "paper:10-48550-arxiv-1706-03762",
    ])
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0]?.relation).toBe("cites")
    expect(parsed.edges[0]?.from).toBe("note:papers/main.tex")
  })
})
