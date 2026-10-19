import { Button } from "@opencode/ui/button"
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { useResearchosDirectory } from "@/components/researchos-rail"
import { createResearchosClient } from "@/utils/researchos-client"
import { formatServerError } from "@/runtime/server/errors"
import { ModuleState } from "@/components/researchos/module-state"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { DataPanel } from "./data-panel"
import { NotebookCell, type NotebookCellRow } from "./notebook-cell"

export default function DataPage() {
  const directory = useResearchosDirectory()
    const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const client = createMemo(() => createResearchosClient({ baseUrl: serverSDK.url, fetch: platform.fetch, password: serverSDK.server.http.password })["server.researchos-data"].data)
  const location = () => ({ directory: directory() ?? "" })
  const [notebooks] = createResource(() => directory(), async () => client().notebooks({ location: location() }).then((result) => result.data))
  const [notebookId, setNotebookId] = createSignal<string>()
  const [cells, cellActions] = createResource(notebookId, async (id) => client().cells({ id, location: location() }).then((result) => result.data.map(normalizeCell)))
  const [datasets, datasetActions] = createResource(() => directory(), async () => client().datasets({ location: location() }).then((result) => result.data.map((dataset) => ({
    id: dataset.id, name: dataset.name, path: dataset.path, format: dataset.format,
    sizeBytes: finite(dataset.sizeBytes) ?? 0,
    ...(dataset.profileJson ? { profileJson: dataset.profileJson } : {}),
  }))))
  const [artifacts, artifactActions] = createResource(() => directory(), async () => client().artifacts({ location: location() }).then((result) => result.data.map((artifact) => ({
    id: artifact.id, kind: artifact.kind, path: artifact.path, format: artifact.format,
    createdAt: finite(artifact.createdAt) ?? 0,
    ...(finite(artifact.dpi) === undefined ? {} : { dpi: finite(artifact.dpi) }),
    ...(artifact.latexSnippet ? { latexSnippet: artifact.latexSnippet } : {}),
  }))))
  const [tests, testActions] = createResource(() => directory(), async () => client().statTests({ location: location() }).then((result) => result.data.map((test) => ({ ...test, statistic: finite(test.statistic), pValue: finite(test.pValue) }))))
  const [registerPath, setRegisterPath] = createSignal("")
  const [registerName, setRegisterName] = createSignal("")
  const [registering, setRegistering] = createSignal(false)
  const [registerError, setRegisterError] = createSignal<string>()
  const [status, setStatus] = createSignal("Persistent Python kernel · workspace sandbox · 120 s timeout")

  createEffect(() => { if (!notebookId() && notebooks()?.[0]) setNotebookId(notebooks()![0]!.id) })
  createEffect(() => {
    const id = notebookId()
    shell.setAgentContext(id ? { module: "data", resource: id } : { module: "data" })
  })
  onCleanup(() => shell.setAgentContext(undefined))

  const addCell = async () => {
    const id = notebookId()
    if (!id) return
    await client().cell_create({ id, location: location(), source: "" })
    await cellActions.refetch()
  }

  const saveCell = async (id: string, source: string) => {
    await client().cell_save({ id, location: location(), source })
    setStatus(`Saved ${id}`)
  }

  const registerDataset = async () => {
    const path = registerPath().trim()
    if (!path) return
    setRegistering(true); setRegisterError(undefined)
    try {
      await client().dataset_register({ location: location(), path, ...(registerName().trim() ? { name: registerName().trim() } : {}) })
      setRegisterPath(""); setRegisterName("")
      await Promise.all([datasetActions.refetch()])
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : String(error))
    } finally { setRegistering(false) }
  }

  const runCell = async (id: string, source: string) => {
    setStatus(`Running ${id} in the shared kernel…`)
    await client().cell_run({ id, location: location(), source, timeoutS: 120 }).then((result) => {
      setStatus(result.data.error ? `${result.data.error.type}: ${result.data.error.message}` : `Completed in ${finite(result.data.cell.durationMs) ?? 0} ms`)
    })
    await Promise.all([cellActions.refetch(), artifactActions.refetch(), datasetActions.refetch(), testActions.refetch()])
  }

  return (
    <main class="flex h-full min-h-0 flex-col bg-background-stronger text-text-base">
      <header class="flex h-11 shrink-0 items-center gap-3 border-b border-border-weak-base bg-background-base px-3">
        <div><h1 class="text-13-medium">Data analysis notebook</h1><p class="text-10-regular text-text-weak">{status()}</p></div>
        <span class="rounded border border-border-weak-base px-2 py-1 text-10-medium text-text-weak">Python sandbox</span>
        <input class="ml-2 h-7 w-40 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={registerPath()} onInput={(e) => setRegisterPath(e.currentTarget.value)} placeholder="data/experiment.csv" />
        <input class="ml-1 h-7 w-28 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={registerName()} onInput={(e) => setRegisterName(e.currentTarget.value)} placeholder="Name (optional)" />
        <Button size="small" variant="neutral" disabled={registering() || !registerPath().trim()} onClick={() => void registerDataset()}>{registering() ? "…" : "Register dataset"}</Button>
        <Show when={registerError()}><span class="ml-2 text-10-regular text-text-on-critical-strong">{registerError()}</span></Show>
        <select class="ml-auto h-7 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={notebookId()} onChange={(event) => setNotebookId(event.currentTarget.value)}><For each={notebooks()}>{(notebook) => <option value={notebook.id}>{notebook.title}</option>}</For></select>
        <Button size="small" variant="submit" disabled={!notebookId()} onClick={() => void addCell()}>+ Code cell</Button>
      </header>
      <div class="flex min-h-0 flex-1">
        <section class="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="mx-auto max-w-4xl space-y-4">
            <Switch>
              <Match when={cells.loading && !cells()}>
                <ModuleState state="running" title="Loading notebook…" description="Fetching cells from the persistent Python kernel workspace." />
              </Match>
              <Match when={cells.error}>
                <ModuleState
                  state="error"
                  title="Notebook could not be loaded"
                  details={formatServerError(cells.error)}
                  action={{ label: "Retry", onClick: () => void cellActions.refetch() }}
                />
              </Match>
              <Match when={(cells()?.length ?? 0) === 0}>
                <ModuleState
                  state="empty"
                  title="This notebook has no cells"
                  description="Add a code cell to start exploring project data in the shared Python kernel."
                  action={{ label: "Add code cell", onClick: () => void addCell() }}
                />
              </Match>
              <Match when={true}>
                <For each={cells()}>{(cell) => <NotebookCell cell={cell} onSave={(source) => saveCell(cell.id, source)} onRun={(source) => runCell(cell.id, source)} />}</For>
                <button class="w-full rounded-lg border border-dashed border-border-weak-base py-3 text-11-regular text-text-weak hover:border-border-focus hover:text-text-base" onClick={() => void addCell()}>+ Add code cell</button>
              </Match>
            </Switch>
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
