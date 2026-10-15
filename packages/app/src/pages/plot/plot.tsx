import { Button } from "@opencode/ui/button"
import { For, Match, Switch, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { CanvasMode } from "./canvas-mode"
import { ChartMode } from "./chart-mode"
import { CodeMode } from "./code-mode"
import { DiagramMode } from "./diagram-mode"
import { Gallery } from "./gallery"
import type { PlotArtifact } from "./types"

type Mode = "chart" | "canvas" | "diagram" | "code"
export default function PlotPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const client = createMemo(() => createResearchosClient({ baseUrl: sdk().url, fetch: platform.fetch, username: serverSDK().server.http.username, password: serverSDK().server.http.password })["server.researchos-plot"])
  const location = () => ({ directory: sdk().directory })
  const [mode, setMode] = createSignal<Mode>("chart")
  const [galleryOpen, setGalleryOpen] = createSignal(true)
  const [artifacts, actions] = createResource(() => sdk().directory, async () => client().artifacts({ location: location() }).then((result) => result.data as PlotArtifact[]))
  const refresh = async () => { await actions.refetch() }
  createEffect(() => { shell.setAgentContext({ module: "plot", resource: mode() }) })
  onCleanup(() => shell.setAgentContext(undefined))
  return <main class="flex h-full min-h-0 flex-col bg-background-stronger text-text-base">
    <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border-weak-base bg-background-base px-3">
      <div class="mr-3"><h1 class="text-13-medium">Scientific plot studio</h1><p class="text-10-regular text-text-weak">Reproducible artifacts · publication output</p></div>
      <For each={[{ id: "chart", label: "Statistical" }, { id: "canvas", label: "Data canvas" }, { id: "diagram", label: "Diagram" }, { id: "code", label: "Code graph" }] as const}>{(item) => <button class="h-7 rounded px-3 text-11-medium" classList={{ "bg-background-selected text-text-base": mode() === item.id, "text-text-weak hover:bg-background-stronger": mode() !== item.id }} onClick={() => setMode(item.id)}>{item.label}</button>}</For>
      <Button class="ml-auto" size="small" variant="secondary" onClick={() => setGalleryOpen(!galleryOpen())}>{galleryOpen() ? "Hide gallery" : `Gallery (${artifacts()?.length ?? 0})`}</Button>
    </header>
    <div class="flex min-h-0 flex-1"><section class="min-w-0 flex-1"><Switch>
      <Match when={mode() === "chart"}><ChartMode client={client()} location={location()} refresh={refresh} /></Match>
      <Match when={mode() === "canvas"}><CanvasMode artifacts={artifacts() ?? []} /></Match>
      <Match when={mode() === "diagram"}><DiagramMode client={client()} location={location()} refresh={refresh} artifacts={artifacts() ?? []} /></Match>
      <Match when={mode() === "code"}><CodeMode client={client()} location={location()} refresh={refresh} /></Match>
    </Switch></section><Gallery open={galleryOpen()} artifacts={artifacts() ?? []} client={client()} location={location()} refresh={refresh} /></div>
  </main>
}
