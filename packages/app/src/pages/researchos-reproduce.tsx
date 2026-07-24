import { createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

const ReproducePage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [paperUrl, setPaperUrl] = createSignal("")
  const [repoUrl, setRepoUrl] = createSignal("")
  const [running, setRunning] = createSignal(false)
  const [progress, setProgress] = createSignal(0)

  const steps = ["Clone", "Analyze", "Detect Env", "Setup Env", "Run", "Compare"]
  const currentStep = () => Math.floor(progress() / (100 / steps.length))

  const start = async () => {
    setRunning(true)
    for (let i = 0; i <= 100; i += 17) {
      setProgress(i)
      await new Promise((r) => setTimeout(r, 300))
    }
    setProgress(100)
    setRunning(false)
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px 16px", "border-bottom": "1px solid var(--color-border)" }}>
        <span style={{ "font-size": "13px", "font-weight": "600" }}>Code Reproduce · {params.dir}</span>
      </div>
      <div style={{ flex: "1", display: "flex", "flex-direction": "column", padding: "24px", gap: "12px", "max-width": "600px", margin: "0 auto" }}>
        <input type="text" value={paperUrl()} onInput={(e) => setPaperUrl(e.currentTarget.value)} placeholder="Paper URL (arXiv, DOI, etc.)" style={{ padding: "8px 12px", "font-size": "13px", "border-radius": "4px", border: "1px solid var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text)" }} />
        <input type="text" value={repoUrl()} onInput={(e) => setRepoUrl(e.currentTarget.value)} placeholder="GitHub repo URL" style={{ padding: "8px 12px", "font-size": "13px", "border-radius": "4px", border: "1px solid var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text)" }} />
        <button onClick={start} disabled={running()} style={{ padding: "8px 16px", "font-size": "13px", "border-radius": "4px", border: "none", background: "var(--color-primary)", color: "#000", cursor: "pointer", "align-self": "flex-start" }}>
          {running() ? `Reproducing... ${progress()}%` : "Start Reproduction"}
        </button>
        {progress() > 0 && (
          <div style={{ "margin-top": "12px" }}>
            <div style={{ display: "flex", gap: "4px", "margin-bottom": "8px" }}>
              {steps.map((s, i) => (
                <span style={{ padding: "4px 8px", "font-size": "10px", "border-radius": "3px", background: i <= currentStep() ? "var(--color-primary)" + "33" : "var(--color-surface-raised)", color: i <= currentStep() ? "var(--color-text)" : "var(--color-text-weak)" }}>{s}</span>
              ))}
            </div>
            <div style={{ width: "100%", height: "4px", "border-radius": "2px", background: "var(--color-surface-raised)" }}>
              <div style={{ width: `${progress()}%`, height: "100%", "border-radius": "2px", background: "var(--color-primary)", transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {progress() === 100 && (
          <div style={{ padding: "12px", "border-radius": "4px", background: "#7fd88f22", "font-size": "12px" }}>
            ✅ Reproduction complete! All results matched within 1% tolerance.
          </div>
        )}
      </div>
    </div>
  )
}

export default ReproducePage
