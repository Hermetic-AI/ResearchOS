import { createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

interface VisNode {
  id: string
  type: string
  label: string
  x: number
  y: number
}

interface VisEdge {
  from: string
  to: string
  relation: string
}

const mockNodes: VisNode[] = [
  { id: "paper:transformer", type: "paper", label: "Attention Is All You Need", x: 400, y: 300 },
  { id: "paper:bert", type: "paper", label: "BERT", x: 250, y: 150 },
  { id: "paper:gpt3", type: "paper", label: "GPT-3", x: 550, y: 150 },
  { id: "concept:attention", type: "concept", label: "Attention Mechanism", x: 400, y: 100 },
  { id: "concept:transfer-learning", type: "concept", label: "Transfer Learning", x: 400, y: 480 },
  { id: "note:design", type: "note", label: "Architecture Design Notes", x: 150, y: 350 },
  { id: "note:experiments", type: "note", label: "Experiment Log", x: 650, y: 350 },
  { id: "repo:opencode", type: "repo", label: "OpenCode", x: 400, y: 550 },
]

const mockEdges: VisEdge[] = [
  { from: "paper:bert", to: "concept:attention", relation: "mentions" },
  { from: "paper:gpt3", to: "concept:attention", relation: "mentions" },
  { from: "note:design", to: "paper:transformer", relation: "cites" },
  { from: "note:experiments", to: "paper:gpt3", relation: "cites" },
  { from: "note:design", to: "concept:transfer-learning", relation: "mentions" },
  { from: "repo:opencode", to: "paper:transformer", relation: "implements" },
  { from: "repo:opencode", to: "concept:attention", relation: "implements" },
]

const typeColors: Record<string, string> = {
  paper: "#61afef",
  concept: "#9d7cd8",
  note: "#fab283",
  repo: "#7fd88f",
}

const GraphPage: Component = () => {
  const params = useParams<{ dir: string }>()
  const selectedNode = createSignal<VisNode | null>(null)
  const query = createSignal("")
  const answer = createSignal("")

  const [selNode] = selectedNode
  const [q] = query
  const [ans] = answer

  const askQuery = () => {
    if (!q()) return
    answer[1](`Graph RAG: searching for "${q()}"... (stub)`)
  }

  const selId = () => selNode()?.id

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%", position: "relative" }}>
      <div style={{ padding: "8px 16px", display: "flex", gap: "8px", "align-items": "center", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>Knowledge Graph · {params.dir}</span>
        <span style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>
          {mockNodes.length} nodes · {mockEdges.length} edges
        </span>
      </div>

      <div style={{ flex: "1", display: "flex", position: "relative" }}>
        <svg width="100%" height="100%" style={{ background: "var(--color-surface-base)" }}>
          {mockEdges.map((edge) => {
            const from = mockNodes.find((n) => n.id === edge.from)
            const to = mockNodes.find((n) => n.id === edge.to)
            if (!from || !to) return null
            const active = selId() === edge.from || selId() === edge.to
            return (
              <g>
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={active ? "var(--color-text)" : "var(--color-border)"}
                  stroke-width="1"
                />
              </g>
            )
          }).filter(Boolean)}
          {mockNodes.map((node) => (
            <g onClick={() => selectedNode[1](node)} style={{ cursor: "pointer" }}>
              <circle
                cx={node.x} cy={node.y}
                r={node.type === "concept" ? 10 : node.type === "repo" ? 8 : 6}
                fill={typeColors[node.type] || "#888"}
                stroke={selNode()?.id === node.id ? "#fff" : "none"}
                stroke-width="2"
              />
              <text x={node.x} y={node.y + 18} font-size="10" fill="var(--color-text-weak)" text-anchor="middle">
                {node.label.substring(0, 20)}
              </text>
            </g>
          ))}
        </svg>

        <div style={{ position: "absolute", bottom: "0", left: "0", right: "0", padding: "12px 16px", "border-top": "1px solid var(--color-border)", background: "var(--color-surface-base)", display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={q()}
            onInput={(e) => query[1](e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && askQuery()}
            placeholder="Ask a graph question"
            style={{ flex: "1", padding: "6px 10px", "font-size": "12px", "border-radius": "4px", border: "1px solid var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text)" }}
          />
          <button onClick={askQuery} style={{ padding: "6px 12px", "font-size": "12px", "border-radius": "4px", border: "none", background: "var(--color-primary)", color: "#000", cursor: "pointer" }}>
            Ask
          </button>
        </div>
      </div>

      {ans() && (
        <div style={{ padding: "12px 16px", "font-size": "12px", "border-top": "1px solid var(--color-border)", color: "var(--color-text)" }}>
          {ans()}
        </div>
      )}

      {selNode() && (
        <div style={{ position: "absolute", right: "0", top: "0", bottom: "0", width: "280px", padding: "16px", "border-left": "1px solid var(--color-border)", background: "var(--color-surface-raised)", "overflow-y": "auto" }}>
          <div style={{ display: "flex", "justify-content": "space-between", "margin-bottom": "12px" }}>
            <span style={{ "font-size": "11px", padding: "2px 6px", "border-radius": "3px", background: typeColors[selNode()!.type] + "22", color: typeColors[selNode()!.type] }}>
              {selNode()!.type}
            </span>
            <button onClick={() => selectedNode[1](null)} style={{ "font-size": "12px", background: "none", border: "none", color: "var(--color-text-weak)", cursor: "pointer" }}>
              ✕
            </button>
          </div>
          <h3 style={{ "font-size": "14px", "font-weight": "600", margin: "0 0 8px" }}>{selNode()!.label}</h3>
          <p style={{ "font-size": "11px", color: "var(--color-text-weak)", "word-break": "break-all" }}>ID: {selNode()!.id}</p>
        </div>
      )}
    </div>
  )
}

export default GraphPage
