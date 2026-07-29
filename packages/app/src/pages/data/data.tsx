import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { DataPanel } from "./data-panel"
import { NotebookCell, type NotebookCellRow } from "./notebook-cell"

export default function DataPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const client = createMemo(() => createResearchosClient({ baseUrl: sdk().url, fetch: platform.fetch, username: serverSDK().server.http.username, password: serverSDK().server.http.password })["server.researchos-data"])
  const location = () => ({ directory: sdk().directory })
  const [notebooks] = createResource(() => sdk().directory, async () => client().notebooks({ location: location() }).then((result) => result.data))
  const [notebookId, setNotebookId] = createSignal<string>()
  const [cells, cellActions] = createResource(notebookId, async (id) => client().cells({ id, location: location() }).then((result) => result.data.map(normalizeCell)))
  const [datasets, datasetActions] = createResource(() => sdk().directory, async () => client().datasets({ location: location() }).then((result) => result.data.map((dataset) => ({
    id: dataset.id, name: dataset.name, path: dataset.path, format: dataset.format,
    sizeBytes: finite(dataset.sizeBytes) ?? 0,
    ...(dataset.profileJson ? { profileJson: dataset.profileJson } : {}),
  }))))
  const [artifacts, artifactActions] = createResource(() => sdk().directory, async () => client().artifacts({ location: location() }).then((result) => result.data.map((artifact) => ({
    id: artifact.id, kind: artifact.kind, path: artifact.path, format: artifact.format,
    createdAt: finite(artifact.createdAt) ?? 0,
    ...(finite(artifact.dpi) === undefined ? {} : { dpi: finite(artifact.dpi) }),
    ...(artifact.latexSnippet ? { latexSnippet: artifact.latexSnippet } : {}),
  }))))
  const [tests, testActions] = createResource(() => sdk().directory, async () => client().statTests({ location: location() }).then((result) => result.data.map((test) => ({ ...test, statistic: finite(test.statistic), pValue: finite(test.pValue) }))))
  const [status, setStatus] = createSignal("Persistent Python kernel · workspace sandbox · 120 s timeout")

  createEffect(() => { if (!notebookId() && notebooks()?.[0]) setNotebookId(notebooks()![0]!.id) })

  const addCell = async () => {
    const id = notebookId()
    if (!id) return
    await client().cellCreate({ id, location: location(), source: "" })
    await cellActions.refetch()
  }

  const saveCell = async (id: string, source: string) => {
    await client().cellSave({ id, location: location(), source })
    setStatus(`Saved ${id}`)
  }

  const runCell = async (id: string, source: string) => {
    setStatus(`Running ${id} in the shared kernel…`)
    await client().cellRun({ id, location: location(), source, timeoutS: 120 }).then((result) => {
      setStatus(result.data.error ? `${result.data.error.type}: ${result.data.error.message}` : `Completed in ${finite(result.data.cell.durationMs) ?? 0} ms`)
    })
    await Promise.all([cellActions.refetch(), artifactActions.refetch(), datasetActions.refetch(), testActions.refetch()])
  }

  return (
    <main class="flex h-full min-h-0 flex-col bg-background-stronger text-text-base">
      <header class="flex h-11 shrink-0 items-center gap-3 border-b border-border-weak-base bg-background-base px-3">
        <div><h1 class="text-13-medium">Data analysis notebook</h1><p class="text-10-regular text-text-weak">{status()}</p></div>
        <span class="rounded border border-border-weak-base px-2 py-1 text-10-medium text-text-weak">Python sandbox</span>
        <select class="ml-auto h-7 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={notebookId()} onChange={(event) => setNotebookId(event.currentTarget.value)}><For each={notebooks()}>{(notebook) => <option value={notebook.id}>{notebook.title}</option>}</For></select>
        <Button size="small" variant="primary" disabled={!notebookId()} onClick={() => void addCell()}>+ Code cell</Button>
      </header>
      <div class="flex min-h-0 flex-1">
        <section class="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="mx-auto max-w-4xl space-y-4">
            <Show when={cells.loading}><div class="flex justify-center p-12"><Spinner class="size-5" /></div></Show>
            <Show when={!cells.loading && (cells()?.length ?? 0) === 0}><div class="rounded-lg border border-dashed border-border-weak-base p-12 text-center text-12-regular text-text-weak"><p>This notebook has no cells.</p><Button class="mt-3" size="small" variant="secondary" onClick={() => void addCell()}>Add the first code cell</Button></div></Show>
            <For each={cells()}>{(cell) => <NotebookCell cell={cell} onSave={(source) => saveCell(cell.id, source)} onRun={(source) => runCell(cell.id, source)} />}</For>
            <Show when={(cells()?.length ?? 0) > 0}><button class="w-full rounded-lg border border-dashed border-border-weak-base py-3 text-11-regular text-text-weak hover:border-border-focus hover:text-text-base" onClick={() => void addCell()}>+ Add code cell</button></Show>
          </div>
        </section>
        <DataPanel
          datasets={datasets() ?? []}
          artifacts={artifacts() ?? []}
          tests={tests() ?? []}
          loadArtifact={(id) => client().artifactFile({ id, location: location() }).then((result) => result.data)}
          linkArtifact={(id, texFile, texSection) => client().link({ id, location: location(), ...(texFile ? { texFile } : {}), ...(texSection ? { texSection } : {}) }).then((result) => result.data.warning ?? undefined)}
        />
      </div>
    </main>
  )
}

function normalizeCell(cell: Record<string, unknown>): NotebookCellRow {
  return {
    id: cell.id as string,
    position: finite(cell.position) ?? 0,
    source: cell.source as string,
    status: cell.status as NotebookCellRow["status"],
    ...(typeof cell.stdout === "string" ? { stdout: cell.stdout } : {}),
    ...(typeof cell.stderr === "string" ? { stderr: cell.stderr } : {}),
    ...(finite(cell.durationMs as number | string | null | undefined) === undefined ? {} : { durationMs: finite(cell.durationMs as number)! }),
  }
}

function finite(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined }
