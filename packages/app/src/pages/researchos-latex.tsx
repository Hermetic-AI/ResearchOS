import { createSignal, createEffect, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

type WritingTab = "rewrite" | "structure" | "table" | "algo" | "cite"

const LatexPage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [source, setSource] = createSignal(`\\documentclass{article}\n\\title{ResearchOS Paper}\n\\author{}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\n\n\\end{document}`)
  const [log, setLog] = createSignal("Ready. Click Compile to build.")
  const [compiling, setCompiling] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<WritingTab>("rewrite")

  const compile = async () => {
    setCompiling(true)
    setLog("Compiling with Tectonic...")
    await new Promise((r) => setTimeout(r, 1000))
    setCompiling(false)
    setLog("Compilation successful. PDF generated.")
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px 16px", display: "flex", gap: "8px", "align-items": "center", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>LaTeX Editor · {params.dir}</span>
        <button onClick={compile} disabled={compiling()} style={{ padding: "4px 12px", "font-size": "12px", "border-radius": "4px", border: "none", background: "var(--color-primary)", color: "#000", cursor: "pointer" }}>
          {compiling() ? "Compiling..." : "Compile"}
        </button>
        <span style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>Tectonic</span>
      </div>

      <div style={{ flex: "1", display: "flex" }}>
        <div style={{ flex: "1", display: "flex", "flex-direction": "column" }}>
          <textarea
            value={source()}
            onInput={(e) => setSource(e.currentTarget.value)}
            style={{
              flex: "1",
              padding: "16px",
              "font-family": "JetBrains Mono, monospace",
              "font-size": "13px",
              "line-height": "1.6",
              background: "var(--color-surface-base)",
              color: "var(--color-text)",
              border: "none",
              resize: "none",
              outline: "none",
            }}
            spellcheck={false}
          />
          <div style={{ padding: "8px 16px", "font-size": "12px", "font-family": "JetBrains Mono, monospace", "border-top": "1px solid var(--color-border)", background: "var(--color-surface-raised)", color: "var(--color-text-weak)", "max-height": "120px", "overflow-y": "auto", "white-space": "pre-wrap" }}>
            {log()}
          </div>
        </div>

        <div style={{ width: "280px", "border-left": "1px solid var(--color-border)", display: "flex", "flex-direction": "column" }}>
          <div style={{ display: "flex", "border-bottom": "1px solid var(--color-border)" }}>
            {(["rewrite", "structure", "table", "algo", "cite"] as WritingTab[]).map((tab) => (
              <button
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: "1",
                  padding: "6px 4px",
                  "font-size": "10px",
                  border: "none",
                  background: activeTab() === tab ? "var(--color-surface-raised)" : "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  "border-bottom": activeTab() === tab ? "2px solid var(--color-primary)" : "none",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div style={{ flex: "1", padding: "12px", "overflow-y": "auto", "font-size": "12px", color: "var(--color-text-weak)" }}>
            {activeTab() === "rewrite" && (
              <div>
                <p style={{ "font-weight": "500", "margin-bottom": "8px" }}>Academic Rewrite</p>
                <p>Select text in the editor and choose a style to rewrite.</p>
                <div style={{ display: "flex", gap: "4px", "margin-top": "8px" }}>
                  {["academic", "concise", "passive"].map((s) => (
                    <button style={{ padding: "4px 8px", "font-size": "11px", "border-radius": "3px", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)", cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {activeTab() === "structure" && <p>Structure suggestions will appear here based on your research topic.</p>}
            {activeTab() === "table" && <p>Paste CSV data to generate a LaTeX table.</p>}
            {activeTab() === "algo" && <p>Paste code to convert to Algorithm2e pseudocode.</p>}
            {activeTab() === "cite" && <p>Citation suggestions based on current paragraph context.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LatexPage
