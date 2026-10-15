import { describe, expect, it } from "bun:test"
import { parsePanelDirective } from "./panel-protocol"

describe("parsePanelDirective", () => {
  it("reads the directive from MCP metadata", () => {
    const directive = parsePanelDirective({
      "researchos.ui": { panel: "graph", resource: "paper:1706.03762", mode: "auto" },
    })
    expect(directive).toEqual({ panel: "graph", resource: "paper:1706.03762", mode: "auto" })
  })

  it("falls back to JSON text content", () => {
    const directive = parsePanelDirective(undefined, JSON.stringify({
      subgraph: { nodes: [], edges: [] },
      "researchos.ui": { panel: "literature", resource: "1706.03762", mode: "auto" },
    }))
    expect(directive).toEqual({ panel: "literature", resource: "1706.03762", mode: "auto" })
  })

  it("returns undefined for missing mode", () => {
    expect(parsePanelDirective({ "researchos.ui": { panel: "graph" } })).toBeUndefined()
  })

  it("returns undefined for unknown mode", () => {
    expect(parsePanelDirective({ "researchos.ui": { panel: "graph", mode: "unknown" } })).toBeUndefined()
  })

  it("returns undefined for empty input", () => {
    expect(parsePanelDirective(undefined, undefined)).toBeUndefined()
  })
})
