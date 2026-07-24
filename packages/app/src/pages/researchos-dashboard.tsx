import { type Component } from "solid-js"
import { useParams } from "@solidjs/router"

const Dashboard: Component = () => {
  const params = useParams<{ dir: string }>()

  const modules = [
    { name: "Literature", count: "126 papers", route: "literature", color: "#61afef" },
    { name: "Knowledge Graph", count: "47 nodes", route: "graph", color: "#9d7cd8" },
    { name: "LaTeX Editor", count: "3 documents", route: "latex", color: "#fab283" },
    { name: "Data Analysis", count: "12 notebooks", route: "data", color: "#7fd88f" },
    { name: "Plot Center", count: "8 charts", route: "plot", color: "#56b6c2" },
    { name: "Code Reproduce", count: "2 pipelines", route: "reproduce", color: "#e06c75" },
    { name: "Translation", count: "5 papers", route: "translate", color: "#c678dd" },
  ]

  return (
    <div style={{ padding: "32px", "overflow-y": "auto" }}>
      <div style={{ "margin-bottom": "24px" }}>
        <h1 style={{ "font-size": "18px", "font-weight": "600", margin: "0 0 8px" }}>Research Dashboard · {params.dir}</h1>
        <p style={{ "font-size": "13px", color: "var(--color-text-weak)" }}>Research hypothesis: Improving LLM reasoning through structured chain-of-thought prompting</p>
      </div>
      <div style={{ "margin-bottom": "24px", display: "flex", gap: "12px" }}>
        <div style={{ padding: "12px 16px", "border-radius": "6px", background: "var(--color-surface-raised)", "min-width": "120px" }}>
          <div style={{ "font-size": "20px", "font-weight": "600" }}>126</div>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>Papers</div>
        </div>
        <div style={{ padding: "12px 16px", "border-radius": "6px", background: "var(--color-surface-raised)", "min-width": "120px" }}>
          <div style={{ "font-size": "20px", "font-weight": "600" }}>47</div>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>Graph Nodes</div>
        </div>
        <div style={{ padding: "12px 16px", "border-radius": "6px", background: "var(--color-surface-raised)", "min-width": "120px" }}>
          <div style={{ "font-size": "20px", "font-weight": "600" }}>3</div>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>Documents</div>
        </div>
        <div style={{ padding: "12px 16px", "border-radius": "6px", background: "var(--color-surface-raised)", "min-width": "120px" }}>
          <div style={{ "font-size": "20px", "font-weight": "600" }}>12</div>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>Notebooks</div>
        </div>
      </div>
      <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
        {modules.map((m) => (
          <div style={{ padding: "16px", "border-radius": "6px", background: "var(--color-surface-raised)", "border-left": `3px solid ${m.color}`, cursor: "pointer" }} onClick={() => window.history.pushState(null, "", `/${params.dir}/${m.route}`)}>
            <div style={{ "font-size": "14px", "font-weight": "500" }}>{m.name}</div>
            <div style={{ "font-size": "12px", color: "var(--color-text-weak)", "margin-top": "4px" }}>{m.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard
