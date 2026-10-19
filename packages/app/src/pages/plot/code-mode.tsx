import { Button } from "@opencode/ui/button"
import { Show, createSignal } from "solid-js"
import { svgUrl, type PlotClient } from "./types"

type Engine = "mermaid" | "graphviz"
const examples = { mermaid: "flowchart LR\n  Data --> Analysis\n  Analysis --> Figure", graphviz: "digraph Research {\n  rankdir=LR;\n  Data -> Analysis -> Figure;\n}" }
export function CodeMode(props: { client: PlotClient; location: { directory: string }; refresh: () => Promise<void> }) {
  const [engine, setEngine] = createSignal<Engine>("mermaid")
  const [code, setCode] = createSignal(examples.mermaid)
  const [preview, setPreview] = createSignal<string>()
  const [status, setStatus] = createSignal("Edit source and render a reproducible project artifact.")
  const [busy, setBusy] = createSignal(false)
  const select = (value: Engine) => { setEngine(value); setCode(examples[value]); setPreview(undefined) }
  const render = async () => {
    setBusy(true)
    try {
      if (engine() === "mermaid") {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" })
        const rendered = await mermaid.render(`researchos-${crypto.randomUUID()}`, code())
        await props.client.mermaid({ location: props.location, code: code(), name: "research-flow", theme: "neutral" })
        setPreview(rendered.svg)
      } else {
        const result = await props.client.graphviz({ location: props.location, dot: code(), engine: "dot", name: "research-graph" })
        setPreview(result.data.svg ?? undefined)
      }
      setStatus("Validated, rendered, and registered in the project gallery.")
      await props.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <div class="grid h-full min-h-0 grid-cols-2"><section class="flex min-h-0 flex-col border-r border-border-weak-base bg-background-base"><header class="flex h-10 items-center gap-1 border-b border-border-weak-base px-3"><button class="rounded px-3 py-1 text-11-medium" classList={{ "bg-background-selected": engine() === "mermaid" }} onClick={() => select("mermaid")}>Mermaid</button><button class="rounded px-3 py-1 text-11-medium" classList={{ "bg-background-selected": engine() === "graphviz" }} onClick={() => select("graphviz")}>Graphviz DOT</button><Button class="ml-auto" size="small" variant="submit" disabled={busy()} onClick={() => void render()}>{busy() ? "Rendering…" : "Render & save"}</Button></header><textarea class="min-h-0 flex-1 resize-none bg-background-base p-4 font-mono text-12-regular outline-none" spellcheck={false} value={code()} onInput={(event) => setCode(event.currentTarget.value)} /><footer class="border-t border-border-weak-base px-3 py-2 text-10-regular text-text-weak">{status()}</footer></section><section class="flex min-h-0 items-center justify-center p-5"><Show when={preview()} fallback={<div class="text-center text-11-regular text-text-weak"><p class="text-14-medium text-text-base">Live code preview</p><p>SVG is displayed in an isolated image surface.</p></div>}>{(svg) => <img class="max-h-full max-w-full" src={svgUrl(svg())} alt={`${engine()} diagram preview`} />}</Show></section></div>
}
