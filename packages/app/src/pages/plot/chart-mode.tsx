import { Button } from "@opencode-ai/ui/button"
import { For, Show, createSignal } from "solid-js"
import { svgUrl, type PlotClient } from "./types"

const templates = ["grouped_bar", "scatter_regression", "boxplot", "violin", "survival", "heatmap"] as const
const sample = JSON.stringify([{ group: "Control", value: 5.2 }, { group: "Control", value: 5.8 }, { group: "Treatment", value: 8.1 }, { group: "Treatment", value: 8.7 }], null, 2)
export function ChartMode(props: { client: PlotClient; location: { directory: string }; refresh: () => Promise<void> }) {
  const [template, setTemplate] = createSignal<typeof templates[number]>("grouped_bar")
  const [theme, setTheme] = createSignal<"nature" | "science" | "ieee" | "prism">("nature")
  const [data, setData] = createSignal(sample)
  const [x, setX] = createSignal("group")
  const [y, setY] = createSignal("value")
  const [title, setTitle] = createSignal("")
  const [chart, setChart] = createSignal<{ chartId: string; artifactPath: string; previewSvg: string; code?: string }>()
  const [groups, setGroups] = createSignal("Control,Treatment")
  const [status, setStatus] = createSignal("Choose a template and provide tidy row data.")
  const [busy, setBusy] = createSignal(false)
  const create = async () => {
    setBusy(true)
    setStatus("Rendering with the isolated Python plot bridge…")
    try {
      const inline = JSON.parse(data()) as Array<Record<string, unknown>>
      const result = await props.client.create({ location: props.location, template: template(), theme: theme(), data: { inline }, spec: { encoding: { x: x(), y: y(), group: x() }, axes: title() ? { title: title() } : {} } })
      setChart(result.data)
      setStatus(`Created ${result.data.chartId}`)
      await props.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const tune = async () => {
    const current = chart(); if (!current) return
    setBusy(true)
    try {
      const result = await props.client.tune({ id: current.chartId, location: props.location, patch: { theme: theme(), encoding: { x: x(), y: y(), group: x() }, axes: title() ? { title: title() } : {} } })
      setChart(result.data); setStatus(result.data.codePriority ? "Rendered from manually edited chart.py" : "Spec and generated code updated"); await props.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const significance = async () => {
    const current = chart(); if (!current) return
    const pair = groups().split(",").map((value) => value.trim())
    if (pair.length !== 2 || !pair[0] || !pair[1]) return setStatus("Enter exactly two comma-separated groups.")
    setBusy(true)
    try {
      const result = await props.client.annotateSignificance({ id: current.chartId, location: props.location, test: "ttest", groups: [[pair[0], pair[1]]] })
      const pValue = result.data.pValues[0]?.pValue
      setChart({ ...current, previewSvg: result.data.previewSvg, artifactPath: result.data.artifactPath }); setStatus(`Welch t-test: p=${typeof pValue === "number" ? pValue.toPrecision(3) : pValue} ${result.data.pValues[0]?.stars}`); await props.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <div class="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)_260px]">
    <aside class="overflow-y-auto border-r border-border-weak-base bg-background-base p-3"><p class="mb-2 text-10-medium uppercase tracking-wide text-text-weak">Templates</p><div class="space-y-1"><For each={templates}>{(item) => <button class="w-full rounded border px-2 py-2 text-left text-11-medium" classList={{ "border-border-focus bg-background-selected": template() === item, "border-border-weak-base": template() !== item }} onClick={() => setTemplate(item)}>{item.replaceAll("_", " ")}</button>}</For></div></aside>
    <section class="flex min-h-0 flex-col p-4"><div class="mb-3 flex items-center gap-2"><select class="h-7 rounded border border-border-weak-base bg-background-base px-2 text-11-regular" value={theme()} onChange={(event) => setTheme(event.currentTarget.value as typeof theme extends () => infer T ? T : never)}><option>nature</option><option>science</option><option>ieee</option><option>prism</option></select><span class="text-10-regular text-text-weak">{status()}</span><Button class="ml-auto" size="small" variant="primary" disabled={busy()} onClick={() => void create()}>{busy() ? "Rendering…" : "Create chart"}</Button></div><div class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border-weak-base bg-background-base p-5"><Show when={chart()} fallback={<div class="text-center text-11-regular text-text-weak"><p class="text-16-medium text-text-base">Publication preview</p><p class="mt-1">PDF and SVG will be generated together.</p></div>}>{(value) => <img class="max-h-full max-w-full" src={svgUrl(value().previewSvg)} alt="Rendered statistical chart" />}</Show></div></section>
    <aside class="overflow-y-auto border-l border-border-weak-base bg-background-base p-3 text-11-regular"><p class="mb-2 text-10-medium uppercase tracking-wide text-text-weak">Data & tuning</p><label class="block">Inline JSON<textarea class="mt-1 h-48 w-full resize-y rounded border border-border-weak-base bg-background-stronger p-2 font-mono text-10-regular" value={data()} onInput={(event) => setData(event.currentTarget.value)} /></label><div class="mt-3 grid grid-cols-2 gap-2"><Field label="X / group" value={x()} set={setX} /><Field label="Y" value={y()} set={setY} /></div><Field label="Title" value={title()} set={setTitle} /><Button class="mt-2 w-full" size="small" variant="secondary" disabled={!chart() || busy()} onClick={() => void tune()}>Apply spec patch</Button><div class="mt-5 border-t border-border-weak-base pt-3"><Field label="Significance pair" value={groups()} set={setGroups} /><Button class="mt-2 w-full" size="small" variant="secondary" disabled={!chart() || busy()} onClick={() => void significance()}>Run Welch t-test</Button></div><Show when={chart()?.code}>{(code) => <details class="mt-4"><summary class="cursor-pointer text-10-medium text-text-weak">Generated Python</summary><pre class="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-background-stronger p-2 text-10-regular">{code()}</pre></details>}</Show></aside>
  </div>
}
function Field(props: { label: string; value: string; set: (value: string) => void }) { return <label class="mt-2 block text-10-regular text-text-weak">{props.label}<input class="mt-1 h-7 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular text-text-base" value={props.value} onInput={(event) => props.set(event.currentTarget.value)} /></label> }
