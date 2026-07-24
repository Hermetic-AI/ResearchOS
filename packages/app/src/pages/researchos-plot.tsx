import { createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

type PlotMode = "chart" | "diagram" | "mermaid" | "graphviz"

const PlotPage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [mode, setMode] = createSignal<PlotMode>("chart")
  const [theme, setTheme] = createSignal("nature")

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px 16px", display: "flex", gap: "8px", "align-items": "center", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>Plot Center · {params.dir}</span>
        {(["chart", "diagram", "mermaid", "graphviz"] as PlotMode[]).map((m) => (
          <button onClick={() => setMode(m)} style={{ padding: "4px 10px", "font-size": "11px", "border-radius": "3px", border: "1px solid var(--color-border)", background: mode() === m ? "var(--color-surface-raised)" : "transparent", color: "var(--color-text)", cursor: "pointer" }}>{m}</button>
        ))}
        <select onChange={(e) => setTheme(e.currentTarget.value)} value={theme()} style={{ "margin-left": "auto", padding: "4px", "font-size": "11px", "border-radius": "3px", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)" }}>
          <option>nature</option><option>science</option><option>ieee</option><option>prism</option>
        </select>
      </div>
      <div style={{ flex: "1", display: "flex", "align-items": "center", "justify-content": "center", background: "var(--color-surface-base)" }}>
        <div style={{ "text-align": "center", color: "var(--color-text-weak)", "font-size": "12px" }}>
          <p style={{ "font-size": "28px", "margin-bottom": "8px" }}>▦</p>
          <p>Plot mode: <strong>{mode()}</strong> · Theme: <strong>{theme()}</strong></p>
          <p style={{ "margin-top": "4px", "font-size": "11px" }}>Drop a CSV file or write Mermaid/DOT source to start</p>
        </div>
      </div>
    </div>
  )
}

export default PlotPage
