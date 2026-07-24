import { createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

const DataPage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [code, setCode] = createSignal(`import pandas as pd\nimport matplotlib.pyplot as plt\n\n# Load data\ndf = pd.read_csv("data.csv")\nprint(df.describe())`)
  const [output, setOutput] = createSignal("")
  const [running, setRunning] = createSignal(false)

  const run = async () => {
    setRunning(true)
    setOutput("Running in sandbox...")
    await new Promise((r) => setTimeout(r, 800))
    setRunning(false)
    setOutput("count  3.0\nmean   2.0\nstd    1.0\nName: x, dtype: float64")
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px 16px", display: "flex", gap: "8px", "align-items": "center", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>Data Analysis · {params.dir}</span>
        <span style={{ "font-size": "11px", padding: "2px 6px", "border-radius": "3px", background: "#7fd88f22", color: "#7fd88f" }}>Python Sandbox</span>
        <button onClick={run} disabled={running()} style={{ "margin-left": "auto", padding: "4px 12px", "font-size": "12px", "border-radius": "4px", border: "none", background: "var(--color-primary)", color: "#000", cursor: "pointer" }}>
          {running() ? "Running..." : "Run Cell"}
        </button>
      </div>
      <div style={{ flex: "1", display: "flex" }}>
        <div style={{ flex: "1", display: "flex", "flex-direction": "column" }}>
          <textarea value={code()} onInput={(e) => setCode(e.currentTarget.value)} style={{ flex: "1", padding: "16px", "font-family": "JetBrains Mono, monospace", "font-size": "12px", "line-height": "1.5", background: "var(--color-surface-base)", color: "var(--color-text)", border: "none", resize: "none", outline: "none" }} spellcheck={false} />
          <div style={{ padding: "12px 16px", "font-size": "12px", "font-family": "JetBrains Mono, monospace", "border-top": "1px solid var(--color-border)", background: "var(--color-surface-raised)", color: "var(--color-text)", "max-height": "200px", "overflow-y": "auto", "white-space": "pre-wrap" }}>
            {output() || "Output will appear here..."}
          </div>
        </div>
        <div style={{ width: "220px", padding: "16px", "border-left": "1px solid var(--color-border)" }}>
          <h3 style={{ "font-size": "12px", "font-weight": "600", margin: "0 0 8px" }}>Data Files</h3>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>
            <div style={{ padding: "4px 0" }}>📄 data.csv</div>
            <div style={{ padding: "4px 0" }}>📄 experiments.json</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DataPage
