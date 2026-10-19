import { Button } from "@opencode/ui/button"
import { For, Show, createSignal } from "solid-js"
import { svgUrl, type PlotArtifact, type PlotClient } from "./types"

export function Gallery(props: { open: boolean; artifacts: PlotArtifact[]; client: PlotClient; location: { directory: string }; refresh: () => Promise<void> }) {
  const [selected, setSelected] = createSignal<PlotArtifact>()
  const [texFile, setTexFile] = createSignal("paper.tex")
  const [caption, setCaption] = createSignal("Research result")
  const [status, setStatus] = createSignal("")
  const insert = async () => {
    const artifact = selected(); if (!artifact) return
    try {
      const result = await props.client.insert({ location: props.location, artifactPath: artifact.path, texFile: texFile(), caption: caption() })
      setStatus(`Inserted ${result.data.latexSnippet.split("\n")[0]}`); await props.refresh()
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
  }
  return <Show when={props.open}><aside class="flex h-full min-h-0 w-[300px] shrink-0 flex-col border-l border-border-weak-base bg-background-base"><header class="border-b border-border-weak-base px-3 py-2"><h2 class="text-12-medium">Artifact gallery</h2><p class="text-10-regular text-text-weak">{props.artifacts.length} versioned outputs</p></header><div class="min-h-0 flex-1 overflow-y-auto p-3"><For each={props.artifacts} fallback={<p class="rounded border border-dashed border-border-weak-base p-4 text-center text-11-regular text-text-weak">Rendered artifacts appear here.</p>}>{(artifact) => <button class="mb-2 w-full rounded border p-2 text-left" classList={{ "border-border-focus bg-background-selected": selected()?.id === artifact.id, "border-border-weak-base": selected()?.id !== artifact.id }} onClick={() => setSelected(artifact)}><Show when={artifact.previewSvg}><img class="h-28 w-full object-contain" src={svgUrl(artifact.previewSvg!)} alt={artifact.path} /></Show><div class="mt-1 flex items-center gap-2"><span class="rounded bg-background-stronger px-1.5 py-0.5 text-9-medium uppercase">{artifact.kind}</span><span class="min-w-0 flex-1 truncate text-10-regular">{artifact.path}</span></div><Show when={artifact.texFile}><p class="mt-1 text-9-regular text-text-weak">Referenced by {artifact.texFile}</p></Show></button>}</For></div><Show when={selected()}><footer class="border-t border-border-weak-base p-3"><p class="mb-2 text-10-medium uppercase tracking-wide text-text-weak">Insert into manuscript</p><input class="mb-2 h-7 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={texFile()} onInput={(event) => setTexFile(event.currentTarget.value)} placeholder="paper.tex" /><input class="mb-2 h-7 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={caption()} onInput={(event) => setCaption(event.currentTarget.value)} placeholder="Caption" /><Button class="w-full" size="small" variant="submit" onClick={() => void insert()}>Insert figure block</Button><Show when={status()}><p class="mt-2 text-10-regular text-text-weak">{status()}</p></Show></footer></Show></aside></Show>
}
