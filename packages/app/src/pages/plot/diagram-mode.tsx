import { Button } from "@opencode-ai/ui/button"
import { For, onCleanup, onMount, createSignal } from "solid-js"
import type { PlotArtifact, PlotClient } from "./types"

const origin = "https://embed.diagrams.net"
export function DiagramMode(props: { client: PlotClient; location: { directory: string }; refresh: () => Promise<void>; artifacts: PlotArtifact[] }) {
  let frame: HTMLIFrameElement | undefined
  const [file, setFile] = createSignal<string>()
  const [xml, setXml] = createSignal<string>()
  const [ready, setReady] = createSignal(false)
  const [status, setStatus] = createSignal("Create or open a project-owned .drawio document.")
  const drawios = () => props.artifacts.filter((artifact) => artifact.kind === "drawio")
  const send = (message: Record<string, unknown>) => frame?.contentWindow?.postMessage(JSON.stringify(message), origin)
  const persist = async (value: string) => {
    const current = file(); if (!current) return
    await props.client.diagramSave({ location: props.location, file: current, xml: value })
    setXml(value); setStatus(`Saved ${current}`)
  }
  const receive = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== frame?.contentWindow) return
    const message = parseDrawioMessage(event.data)
    if (!message) return
    if (message.event === "init") { setReady(true); if (xml()) send({ action: "load", xml: xml(), autosave: 1 }) }
    if ((message.event === "save" || message.event === "autosave") && typeof message.xml === "string") void persist(message.xml).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }
  onMount(() => window.addEventListener("message", receive))
  onCleanup(() => window.removeEventListener("message", receive))
  const open = async (artifact: PlotArtifact) => {
    const result = await props.client.artifactFile({ id: artifact.id, location: props.location })
    setFile(artifact.path); setXml(result.data.content); setStatus(`Opened ${artifact.path}`)
    if (ready()) send({ action: "load", xml: result.data.content, autosave: 1 })
  }
  const create = async () => {
    const result = await props.client.diagram({ location: props.location, action: "create", file: `diagram-${Date.now()}`, stencilPack: "flow" })
    setFile(result.data.file); setStatus(`Created ${result.data.file}. Refreshing gallery…`); await props.refresh()
  }
  return <div class="flex h-full min-h-0"><aside class="w-64 shrink-0 overflow-y-auto border-r border-border-weak-base bg-background-base p-3"><Button class="w-full" size="small" variant="primary" onClick={() => void create()}>New draw.io diagram</Button><p class="mb-2 mt-4 text-10-medium uppercase tracking-wide text-text-weak">Project diagrams</p><For each={drawios()} fallback={<p class="text-11-regular text-text-weak">No diagrams yet.</p>}>{(artifact) => <button class="mb-1 w-full truncate rounded border border-border-weak-base px-2 py-2 text-left text-11-regular hover:bg-background-selected" onClick={() => void open(artifact)}>{artifact.path}</button>}</For></aside><section class="flex min-w-0 flex-1 flex-col"><header class="flex h-10 items-center gap-2 border-b border-border-weak-base px-3"><span class="truncate text-11-medium">{file() ?? "No diagram loaded"}</span><span class="text-10-regular text-text-weak">{status()}</span><Button class="ml-auto" size="small" variant="secondary" disabled={!file()} onClick={() => send({ action: "save" })}>Save now</Button></header><iframe ref={frame} class="min-h-0 flex-1 border-0 bg-white" title="draw.io diagram editor" src={`${origin}/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=0`} /></section></div>
}

export function parseDrawioMessage(value: unknown) {
  if (typeof value === "object" && value !== null) return value as { event?: string; xml?: string }
  if (typeof value !== "string") return undefined
  try { const parsed = JSON.parse(value); return typeof parsed === "object" && parsed !== null ? parsed as { event?: string; xml?: string } : undefined } catch { return undefined }
}
