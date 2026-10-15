import { Button } from "@opencode-ai/ui/button"
import { For, Show, createSignal } from "solid-js"

type Tab = "datasets" | "artifacts" | "tests"
type Dataset = { id: string; name: string; path: string; format: string; sizeBytes: number; profileJson?: string }
type Artifact = { id: string; kind: string; path: string; format: string; dpi?: number; latexSnippet?: string; createdAt: number }
type StatTest = { id: string; test: string; statistic?: number; pValue?: number; conclusion: string }

export function DataPanel(props: {
  datasets: ReadonlyArray<Dataset>
  artifacts: ReadonlyArray<Artifact>
  tests: ReadonlyArray<StatTest>
  loadArtifact: (id: string) => Promise<{ format: string; content: string; encoding: "utf8" | "base64" }>
  linkArtifact: (id: string, texFile?: string, texSection?: string) => Promise<string | undefined>
}) {
  const [tab, setTab] = createSignal<Tab>("datasets")
  const [preview, setPreview] = createSignal<{ id: string; url?: string; text?: string }>()
  const [texFile, setTexFile] = createSignal("")
  const [texSection, setTexSection] = createSignal("")
  const [notice, setNotice] = createSignal<string>()

  const openArtifact = async (artifact: Artifact) => {
    const file = await props.loadArtifact(artifact.id)
    if (file.format === "svg") {
      setPreview({ id: artifact.id, url: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(file.content)))}` })
      return
    }
    if (["png", "jpg", "jpeg"].includes(file.format) && file.encoding === "base64") {
      setPreview({ id: artifact.id, url: `data:image/${file.format};base64,${file.content}` })
      return
    }
    setPreview({ id: artifact.id, text: file.encoding === "utf8" ? file.content : `${file.format.toUpperCase()} binary artifact` })
  }

  return (
    <aside class="flex h-full min-h-0 w-[330px] shrink-0 flex-col border-l border-border-weak-base bg-background-base">
      <div class="flex h-10 shrink-0 items-end border-b border-border-weak-base px-2">
        <For each={["datasets", "artifacts", "tests"] as Tab[]}>{(item) => <button
          class="h-9 flex-1 border-b-2 text-10-medium uppercase tracking-wide"
          classList={{ "border-border-focus text-text-base": tab() === item, "border-transparent text-text-weak": tab() !== item }}
          onClick={() => setTab(item)}
        >{item}</button>}</For>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3 text-11-regular text-text-weak">
        <Show when={notice()}>{(value) => <p class="mb-3 rounded border border-border-weak-base bg-background-stronger p-2">{value()}</p>}</Show>
        <Show when={tab() === "datasets"}>
          <For each={props.datasets} fallback={<Empty text="No registered datasets. Run data.profile through the Data Agent to register CSV, Parquet, or JSON files." />}>
            {(dataset) => <article class="mb-2 rounded border border-border-weak-base p-2">
              <div class="flex items-center justify-between"><h3 class="text-12-medium text-text-base">{dataset.name}</h3><span>{dataset.format}</span></div>
              <p class="mt-1 truncate">{dataset.path}</p><p>{formatBytes(dataset.sizeBytes)}</p>
              <Show when={dataset.profileJson}>{(json) => <details class="mt-2"><summary class="cursor-pointer text-text-base">Cached profile</summary><pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background-stronger p-2 font-mono text-10-regular">{prettyJson(json())}</pre></details>}</Show>
            </article>}
          </For>
        </Show>
        <Show when={tab() === "artifacts"}>
          <For each={props.artifacts} fallback={<Empty text="No artifacts yet. Cells that write into .researchos/artifacts are registered automatically." />}>
            {(artifact) => <article class="mb-2 rounded border border-border-weak-base p-2">
              <div class="flex items-center justify-between"><h3 class="truncate text-12-medium text-text-base">{artifact.path}</h3><span>{artifact.format}</span></div>
              <p class="mt-1">{artifact.kind}{artifact.dpi ? ` · ${artifact.dpi} DPI` : ""}</p>
              <div class="mt-2 flex gap-1"><Button size="small" variant="ghost" onClick={() => void openArtifact(artifact)}>Preview</Button><Button size="small" variant="ghost" onClick={() => void navigator.clipboard?.writeText(artifact.latexSnippet ?? artifact.path)}>Copy LaTeX</Button></div>
              <Show when={preview()?.id === artifact.id}><div class="mt-2 rounded bg-white p-2"><Show when={preview()?.url} fallback={<pre class="whitespace-pre-wrap text-black">{preview()?.text}</pre>}>{(url) => <img class="max-h-52 w-full object-contain" src={url()} alt={artifact.path} />}</Show></div></Show>
              <div class="mt-2 grid grid-cols-2 gap-1"><input class={inputClass} value={texFile()} onInput={(event) => setTexFile(event.currentTarget.value)} placeholder="paper/main.tex" /><input class={inputClass} value={texSection()} onInput={(event) => setTexSection(event.currentTarget.value)} placeholder="sec:results" /></div>
              <Button class="mt-2" size="small" variant="secondary" onClick={() => void props.linkArtifact(artifact.id, texFile() || undefined, texSection() || undefined).then((warning) => setNotice(warning ?? "Artifact linked to the current git commit."))}>Link experiment</Button>
            </article>}
          </For>
        </Show>
        <Show when={tab() === "tests"}>
          <For each={props.tests} fallback={<Empty text="No statistical tests recorded yet." />}>
            {(test) => <article class="mb-2 rounded border border-border-weak-base p-2"><div class="flex justify-between"><h3 class="text-12-medium text-text-base">{test.test}</h3><span>p={formatNumber(test.pValue)}</span></div><p class="mt-1">stat={formatNumber(test.statistic)}</p><p class="mt-2 leading-5 text-text-base">{test.conclusion}</p></article>}
          </For>
        </Show>
      </div>
    </aside>
  )
}

function Empty(props: { text: string }) { return <p class="mt-8 px-3 text-center leading-5">{props.text}</p> }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB` }
function formatNumber(value?: number) { return value === undefined ? "—" : value.toPrecision(4) }
function prettyJson(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value } }
const inputClass = "h-7 min-w-0 rounded border border-border-weak-base bg-background-stronger px-2 text-10-regular text-text-base outline-none focus:border-border-focus"
