import { createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

const TranslatePage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [paperId, setPaperId] = createSignal("")
  const [translating, setTranslating] = createSignal(false)
  const [result, setResult] = createSignal("")

  const translate = async () => {
    setTranslating(true)
    setResult("Extracting PDF...\nTranslating with LibreTranslate...\nPolishing with LLM...")
    await new Promise((r) => setTimeout(r, 1500))
    setTranslating(false)
    setResult(`# Translation Result\n\n## Abstract\n\n[译] This is the translated abstract of paper ${paperId()}.\n\n## Introduction\n\n[译] Translated introduction content...\n\n---\n\n**术语对照表**\n| English | 中文 |\n|---|---|\n| attention | 注意力 |\n| transformer | 变换器 |`)
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px 16px", display: "flex", gap: "8px", "align-items": "center", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>Translation Center · {params.dir}</span>
        <span style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>EN → ZH · API + LLM Pipeline</span>
      </div>
      <div style={{ flex: "1", display: "flex", padding: "24px", gap: "16px" }}>
        <div style={{ width: "300px", display: "flex", "flex-direction": "column", gap: "8px" }}>
          <input value={paperId()} onInput={(e) => setPaperId(e.currentTarget.value)} placeholder="Paper ID or DOI" style={{ padding: "8px 12px", "font-size": "13px", "border-radius": "4px", border: "1px solid var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text)" }} />
          <select style={{ padding: "8px 12px", "font-size": "13px", "border-radius": "4px", border: "1px solid var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text)" }}>
            <option value="all">All Sections</option>
            <option value="abstract">Abstract Only</option>
          </select>
          <button onClick={translate} disabled={translating()} style={{ padding: "8px 16px", "font-size": "13px", "border-radius": "4px", border: "none", background: "var(--color-primary)", color: "#000", cursor: "pointer" }}>
            {translating() ? "Translating..." : "Start Translation"}
          </button>
          <div style={{ "font-size": "11px", color: "var(--color-text-weak)", "margin-top": "8px" }}>
            <p>⚙ Pipeline: <strong>PDF Extract → API Translate → LLM Polish</strong></p>
            <p>🔒 Formulas and data preserved as-is</p>
          </div>
        </div>
        <div style={{ flex: "1", padding: "16px", background: "var(--color-surface-base)", "border-radius": "4px", "border": "1px solid var(--color-border)", "font-size": "13px", "line-height": "1.6", "white-space": "pre-wrap", "overflow-y": "auto" }}>
          {result() || "Translation result will appear here..."}
        </div>
      </div>
    </div>
  )
}

export default TranslatePage
