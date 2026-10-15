import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tag } from "@opencode-ai/ui/tag"
import type { ServerResearchosLiteratureCitationsOutput, ServerResearchosLiteratureSimilarOutput } from "@opencode-ai/client"
import { DateTime } from "luxon"
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { ModuleState, StatusBadge } from "@/components/researchos/module-state"
import { archivedPdfPath, readingNotePath, readPaperSessions, startReadingNoteSession } from "@/components/researchos/paper-context"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { createResearchosClient } from "@/utils/researchos-client"
import { formatServerError } from "@/utils/server-errors"
import { showToast } from "@/utils/toast"

type Category = "all" | "unread" | "favorites" | `year:${number}`
type CitationDirection = "references" | "cited_by"
type CitationEntry = ServerResearchosLiteratureCitationsOutput["data"][number]
type SimilarEntry = ServerResearchosLiteratureSimilarOutput["data"]["results"][number]
type ExportFormat = "bibtex" | "ris" | "endnote" | "json" | "markdown"
type CitationStyle = "ieee" | "acm" | "apa" | "nature" | "springer"

export default function LiteraturePage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const client = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-literature"])
  const [papers, papersActions] = createResource(
    () => sdk().directory,
    async (directory) => client().list({ location: { directory }, limit: 100 }).then((result) => result.data),
  )
  const [category, setCategory] = createSignal<Category>("all")
  const [selectedId, setSelectedId] = createSignal<string>()
  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [searchError, setSearchError] = createSignal<string>()
  const [exported, setExported] = createSignal<string>()
  const [exportError, setExportError] = createSignal<string>()
  const [importPath, setImportPath] = createSignal("")
  const [importUrl, setImportUrl] = createSignal("")
  const [importFiles, setImportFiles] = createSignal<File[]>([])
  const [importing, setImporting] = createSignal(false)
  const [importError, setImportError] = createSignal<string>()
  const [importFailures, setImportFailures] = createSignal<{ name: string; reason: string }[]>([])
  const [importNotice, setImportNotice] = createSignal<string>()
  const [zoteroPath, setZoteroPath] = createSignal("")
  const [importingZotero, setImportingZotero] = createSignal(false)
  const [zoteroError, setZoteroError] = createSignal<string>()
  const [zoteroNotice, setZoteroNotice] = createSignal<string>()
  const [citationTab, setCitationTab] = createSignal<CitationDirection>("references")
  const [noting, setNoting] = createSignal(false)
  const [noteError, setNoteError] = createSignal<string>()
  const [citations] = createResource(
    () => {
      const id = selectedId()
      return id ? { id, direction: citationTab() } : undefined
    },
    async (input) => client().citations({
      id: input.id,
      location: { directory: sdk().directory },
      direction: input.direction,
    }).then((result) => result.data),
  )
  const [similar] = createResource(
    () => selectedId(),
    async (id) => client().similar({
      id,
      location: { directory: sdk().directory },
      limit: 10,
    }).then((result) => result.data),
  )
  const years = createMemo(() => Array.from(new Set((papers() ?? []).flatMap((paper) => {
    const value = finiteNumber(paper.year)
    return value === undefined ? [] : [value]
  }))).sort((a, b) => b - a))
  const visible = createMemo(() => (papers() ?? []).filter((paper) => {
    if (category() === "unread") return !paper.isRead
    if (category() === "favorites") return paper.isFavorite
    if (category().startsWith("year:")) return finiteNumber(paper.year) === Number(category().slice(5))
    return true
  }))
  const selected = createMemo(() => (papers() ?? []).find((paper) => paper.id === selectedId()))
  // Non-null accessor for the detail pane: only read inside <Show when={selected()}>,
  // which stays truthy across selection changes so the <article> never remounts.
  const detail = () => selected()!
  const shell = useResearchosShell()
  const sync = useServerSync()
  const [sessionStore] = sync().child(sdk().directory, { bootstrap: false })
  let searchInput!: HTMLInputElement
  let importInput!: HTMLInputElement
  let fileInput!: HTMLInputElement
  let mainEl!: HTMLElement

  // The detail pane stays mounted across selection changes, so reset its scroll
  // position explicitly — otherwise it keeps the previous paper's reading offset.
  createEffect(() => {
    selectedId()
    mainEl.scrollTop = 0
  })

  createEffect(() => {
    sync().child(sdk().directory, { bootstrap: true })
  })

  // Sessions recorded against this paper (reading note, dock chats), joined with the live
  // session store; ids no longer present in the store were deleted and are dropped.
  const relatedSessions = createMemo(() => {
    const id = selectedId()
    if (!id) return []
    const byID = new Map((sessionStore.session ?? []).map((session) => [session.id, session]))
    return readPaperSessions(sdk().directory, id)
      .flatMap((sessionID) => {
        const session = byID.get(sessionID)
        return session ? [session] : []
      })
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  })

  // Optional enhancement: the reading-note agent writes notes/literature/<id>.md. Missing
  // files and read errors both stay silent — the Reading note action remains the entry point.
  const [readingNote] = createResource(
    () => selectedId(),
    async (id) => {
      const path = readingNotePath(id)
      const result = await sdk().client.file.read({ path }).catch(() => undefined)
      if (result?.data?.type !== "text") return undefined
      const sections = parseNoteSections(result.data.content)
      if (sections.length === 0) return undefined
      return { path, sections }
    },
  )
  const [pdfPath] = createResource(
    () => selected(),
    async (paper) => archivedPdfPath(sdk(), paper),
  )

  const openInGraph = (paperId: string) => navigate(`/${params.dir}/graph?paper=${encodeURIComponent(paperId)}`)

  // Mount the context panel once: props are accessors, so it tracks the selection
  // reactively. Re-creating the JSX per selection remounts the whole panel (visible flicker).
  shell.setContextPanel(
    <PaperContextPanel
      visible={() => !!selected()}
      pdfPath={() => pdfPath()}
      notePath={() => readingNote()?.path}
      onOpenGraph={() => {
        const id = selectedId()
        if (id) openInGraph(id)
      }}
      onInsertCitation={() => navigate(`/${params.dir}/latex`)}
      onTranslate={() => {
        const id = selectedId()
        if (id) navigate(`/${params.dir}/translate?paperId=${encodeURIComponent(id)}`)
      }}
    />,
  )
  onCleanup(() => shell.setContextPanel(undefined))

  createEffect(() => {
    const paper = selected()
    shell.setAgentContext(paper ? { module: "literature", resource: paper.id } : { module: "literature" })
    // Report focus to the core researchos/selection SystemContext source; best-effort,
    // failures must never break the UI.
    client().select({
      location: { directory: sdk().directory },
      ...(paper ? { paperId: paper.id, title: paper.title } : {}),
    }).catch(() => undefined)
  })
  onCleanup(() => shell.setAgentContext(undefined))

  const runSearch = async () => {
    const value = query().trim()
    if (!value || searching()) return
    setSearching(true)
    setSearchError(undefined)
    const result = await client().search({
      location: { directory: sdk().directory },
      query: value,
      limit: 30,
    }).then((response) => response.data).catch((error: unknown) => {
      setSearchError(formatServerError(error))
      return undefined
    })
    if (result) {
      papersActions.mutate(result)
      setCategory("all")
      setSelectedId(result[0]?.id)
    }
    setSearching(false)
  }

  const [exportFormat, setExportFormat] = createSignal<ExportFormat>("bibtex")
  const [exportStyle, setExportStyle] = createSignal<CitationStyle | "none">("none")

  const toggleFlag = async (flag: "isRead" | "isFavorite") => {
    const id = selectedId()
    if (!id) return
    const paper = papers()?.find((p) => p.id === id)
    if (!paper) return
    const value = flag === "isRead" ? !paper.isRead : !paper.isFavorite
    try {
      await client().update({ id, location: { directory: sdk().directory }, ...(flag === "isRead" ? { isRead: value } : { isFavorite: value }) })
      papersActions.mutate((papers() ?? []).map((p) => p.id === id ? { ...p, [flag]: value } : p))
    } catch (error) {
      // silent fail — flag toggle is non-critical
    }
  }

  const exportPaper = async () => {
    const paper = selected()
    if (!paper) return
    setExportError(undefined)
    const style = exportStyle()
    try {
      const result = await client().export({
        location: { directory: sdk().directory },
        paperIds: paper.id,
        format: exportFormat(),
        ...(style === "none" ? {} : { style }),
      })
      setExported(result.data.content)
    } catch (error) {
      setExportError(formatServerError(error))
    }
  }

  const triggerFirstRead = async (paperId: string) => {
    await startReadingNoteSession({
      literature: client(),
      sdk: sdk(),
      paperId,
    }).then(() => {
      showToast({
        title: "First read started",
        description: "The agent is reading the paper in the background. The note will appear under notes/literature/ when ready.",
        variant: "default",
      })
    }).catch(() => {
      // Model unavailable — degrade silently; the import itself succeeded.
    })
  }

  const runImport = async () => {
    const path = importPath().trim()
    const url = importUrl().trim()
    const files = importFiles()
    if ((!path && !url && files.length === 0) || importing()) return
    setImporting(true)
    setImportError(undefined)
    setImportFailures([])
    setImportNotice(undefined)
    if (files.length > 0) {
      const failures: { name: string; reason: string }[] = []
      let succeeded = 0
      for (const [index, file] of files.entries()) {
        setImportNotice(`Importing ${index + 1}/${files.length} · ${file.name}…`)
        const upload = await readPdfFile(file).catch((error: unknown) => {
          failures.push({ name: file.name, reason: formatServerError(error) })
          return undefined
        })
        if (!upload) continue
        const result = await client().import({
          location: { directory: sdk().directory },
          contentBase64: upload,
          fileName: file.name,
        }).then((response) => response.data).catch((error: unknown) => {
          failures.push({ name: file.name, reason: formatServerError(error) })
          return undefined
        })
        if (!result) continue
        succeeded += 1
        if (result.paper) {
          setSelectedId(result.paper.id)
          void triggerFirstRead(result.paper.id)
        }
      }
      await papersActions.refetch()
      setCategory("all")
      const importedLabel = `Imported ${succeeded} ${succeeded === 1 ? "paper" : "papers"}`
      if (failures.length === 0) {
        setImportFiles([])
        fileInput.value = ""
        setImportNotice(importedLabel)
      } else {
        setImportFailures(failures)
        setImportNotice(`${importedLabel} · ${failures.length} failed: ${failures.map((failure) => `${failure.name} (${failure.reason})`).join(", ")}`)
      }
      setImporting(false)
      return
    }
    const result = await client().import({
      location: { directory: sdk().directory },
      path: path || undefined,
      url: url || undefined,
    }).then((response) => response.data).catch((error: unknown) => {
      setImportError(formatServerError(error))
      return undefined
    })
    if (result) {
      setImportNotice(`Imported · metadata from ${result.metadataSource ?? "pdf"} · ${result.references ?? 0} references parsed`)
      setImportPath("")
      setImportUrl("")
      await papersActions.refetch()
      setCategory("all")
      if (result.paper) {
        setSelectedId(result.paper.id)
        void triggerFirstRead(result.paper.id)
      }
    }
    setImporting(false)
  }

  const runZoteroImport = async () => {
    const path = zoteroPath().trim()
    if (!path || importingZotero()) return
    setImportingZotero(true)
    setZoteroError(undefined)
    setZoteroNotice(undefined)
    const result = await client().import({
      location: { directory: sdk().directory },
      zoteroPath: path,
    }).then((response) => response.data).catch((error: unknown) => {
      setZoteroError(formatServerError(error))
      return undefined
    })
    if (result?.zotero) {
      const report = result.zotero
      setZoteroNotice(
        `Zotero import: ${report.imported} imported, ${report.skipped} skipped, ${report.pdfsCopied} PDFs archived, ${report.warnings.length} warnings`,
      )
      setZoteroPath("")
      await papersActions.refetch()
      setCategory("all")
    }
    setImportingZotero(false)
  }

  const runReadingNote = async () => {
    const id = selectedId()
    if (!id || noting()) return
    setNoting(true)
    setNoteError(undefined)
    const sessionID = await startReadingNoteSession({
      literature: client(),
      sdk: sdk(),
      paperId: id,
    }).catch((error: unknown) => {
      setNoteError(formatServerError(error))
      return undefined
    })
    setNoting(false)
    if (sessionID) navigate(`/${params.dir}/session/${sessionID}`)
  }

  return (
    <div class="grid h-full min-h-0 grid-cols-[11rem_20rem_minmax(0,1fr)] bg-background-base xl:grid-cols-[14rem_24rem_minmax(0,1fr)]">
      <aside class="overflow-y-auto border-r border-border-weaker-base bg-background-stronger px-3 py-5">
        <div class="px-2 pb-4">
          <p class="text-14-medium text-text-base">Literature library</p>
          <p class="mt-1 text-11-regular text-text-weak">{papers()?.length ?? 0} project papers</p>
        </div>
        <nav aria-label="Literature categories" class="flex flex-col gap-1">
          <CategoryRow label="All papers" count={papers()?.length ?? 0} selected={category() === "all"} onClick={() => setCategory("all")} />
          <CategoryRow label="Unread" count={(papers() ?? []).filter((paper) => !paper.isRead).length} selected={category() === "unread"} onClick={() => setCategory("unread")} />
          <CategoryRow label="Favorites" count={(papers() ?? []).filter((paper) => paper.isFavorite).length} selected={category() === "favorites"} onClick={() => setCategory("favorites")} />
          <p class="px-2 pb-1 pt-4 font-mono text-10-medium uppercase tracking-wider text-text-weaker">Years</p>
          <For each={years()}>
            {(year) => <CategoryRow label={String(year)} count={(papers() ?? []).filter((paper) => finiteNumber(paper.year) === year).length} selected={category() === `year:${year}`} onClick={() => setCategory(`year:${year}`)} />}
          </For>
        </nav>
      </aside>

      <section class="flex min-h-0 flex-col border-r border-border-weaker-base">
        <div class="border-b border-border-weaker-base p-3">
          <div class="flex gap-2">
            <input
              ref={searchInput}
              aria-label="Search academic papers"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => event.key === "Enter" && void runSearch()}
              placeholder="Search arXiv, S2, Crossref, PubMed…"
              class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-inset-base px-3 py-2 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
            />
            <Button size="small" variant="primary" disabled={!query().trim() || searching()} onClick={() => void runSearch()}>
              <Show when={searching()} fallback="Search"><Spinner class="size-3.5" /></Show>
            </Button>
          </div>
          <Show when={searchError()}>{(error) => <p class="mt-2 text-11-regular text-text-on-critical-strong">{error()}</p>}</Show>
          <div class="mt-2 flex items-center gap-2">
            <label class="flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-border-base bg-surface-inset-base px-3 text-12-medium text-text-base hover:bg-surface-base-hover">
              Choose PDF
              <input
                ref={fileInput}
                class="sr-only"
                type="file"
                multiple
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  setImportFiles(Array.from(event.currentTarget.files ?? []))
                  setImportError(undefined)
                  setImportFailures([])
                }}
              />
            </label>
            <input
              ref={importInput}
              aria-label="Local PDF path"
              value={importPath()}
              onInput={(event) => setImportPath(event.currentTarget.value)}
              placeholder="PDF path in workspace…"
              class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-inset-base px-3 py-2 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
            />
            <input
              aria-label="PDF URL"
              value={importUrl()}
              onInput={(event) => setImportUrl(event.currentTarget.value)}
              onKeyDown={(event) => event.key === "Enter" && void runImport()}
              placeholder="or https://…/paper.pdf"
              class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-inset-base px-3 py-2 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
            />
            <Button size="small" variant="secondary" disabled={(!importPath().trim() && !importUrl().trim() && importFiles().length === 0) || importing()} onClick={() => void runImport()}>
              <Show when={importing()} fallback="Import PDF"><Spinner class="size-3.5" /></Show>
            </Button>
          </div>
          <Show when={importFiles().length > 0}>
            <div class="mt-2 rounded-md border border-border-weaker-base bg-surface-inset-base px-3 py-2">
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">{importFiles().length} {importFiles().length === 1 ? "PDF" : "PDFs"} selected</p>
              <For each={importFiles()}>
                {(file) => <p class="mt-0.5 truncate font-mono text-11-regular text-text-weak" title={file.name}>{file.name}</p>}
              </For>
            </div>
          </Show>
          <Show when={importError()}>
            {(error) => (
              <div class="mt-2">
                <p class="text-11-regular text-text-on-critical-strong">{error()}</p>
                <p class="mt-0.5 text-10-regular text-text-weaker">Inputs are preserved — fix the cause and click Import PDF to retry.</p>
              </div>
            )}
          </Show>
          <Show when={importFailures().length > 0}>
            <div class="mt-2">
              <For each={importFailures()}>
                {(failure) => <p class="mt-0.5 font-mono text-10-regular text-text-on-critical-strong">{failure.name} ({failure.reason})</p>}
              </For>
              <p class="mt-0.5 text-10-regular text-text-weaker">The selection is preserved — click Import PDF to retry.</p>
            </div>
          </Show>
          <Show when={importNotice()}>{(notice) => <p class="mt-2 text-11-regular text-text-weak">{notice()}</p>}</Show>
          <div class="mt-2 flex gap-2">
            <input
              aria-label="Zotero database path"
              value={zoteroPath()}
              onInput={(event) => setZoteroPath(event.currentTarget.value)}
              onKeyDown={(event) => event.key === "Enter" && void runZoteroImport()}
              placeholder="zotero.sqlite path (one-time import)…"
              class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-inset-base px-3 py-2 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
            />
            <Button size="small" variant="secondary" disabled={!zoteroPath().trim() || importingZotero()} onClick={() => void runZoteroImport()}>
              <Show when={importingZotero()} fallback="Import Zotero"><Spinner class="size-3.5" /></Show>
            </Button>
          </div>
          <Show when={zoteroError()}>
            {(error) => (
              <div class="mt-2">
                <p class="text-11-regular text-text-on-critical-strong">{error()}</p>
                <p class="mt-0.5 text-10-regular text-text-weaker">The path is preserved — fix the cause and click Import Zotero to retry.</p>
              </div>
            )}
          </Show>
          <Show when={zoteroNotice()}>{(notice) => <p class="mt-2 text-11-regular text-text-weak">{notice()}</p>}</Show>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show when={papers.loading}>
            <ModuleState
              state="running"
              title="Loading library…"
              description="Fetching the project paper list from the local server."
            />
          </Show>
          <Show when={!papers.loading && papers.error}>
            {(error) => (
              <ModuleState
                state="error"
                title="Library could not be loaded"
                description="The local server did not return the project library. Search and import above stay available."
                details={formatServerError(error())}
                action={{ label: "Retry", onClick: () => void papersActions.refetch() }}
              />
            )}
          </Show>
          <Show when={!papers.loading && !papers.error && (papers() ?? []).length === 0}>
            <ModuleState
              state="empty"
              title="No papers yet"
              description="The library is the evidence base for reading, graph building, citations, and translation. Search arXiv, S2, Crossref, and PubMed above, or import a PDF or Zotero library to add the first paper."
              action={{ label: "Import a PDF", onClick: () => importInput.focus() }}
              secondary={{ label: "Search sources", onClick: () => searchInput.focus() }}
            />
          </Show>
          <Show when={!papers.loading && !papers.error && (papers() ?? []).length > 0 && visible().length === 0}>
            <div class="px-5 py-10">
              <h2 class="text-13-medium text-text-base">No papers in this view</h2>
              <p class="mt-1 text-12-regular text-text-weak">The library has papers, but none match the selected category. Pick another category on the left.</p>
            </div>
          </Show>
          <For each={visible()}>
            {(paper) => (
              <button
                type="button"
                class="block w-full border-b border-border-weaker-base px-4 py-3.5 text-left outline-none hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"
                classList={{ "bg-surface-base-hover": selectedId() === paper.id }}
                onClick={() => {
                  setSelectedId(paper.id)
                  setExported(undefined)
                }}
              >
                <h2 class="text-12-medium leading-5 text-text-base">{paper.title}</h2>
                <p class="mt-1 truncate text-11-regular text-text-weak">{paper.authors.map((author) => author.name).join(", ") || "Unknown authors"}</p>
                <div class="mt-2 flex items-center gap-2">
                  <Tag>{paper.year ?? "n.d."}</Tag>
                  <Tag>{paper.source}</Tag>
                  <span class="text-10-regular text-text-weaker">{paper.citationCount.toLocaleString()} citations</span>
                </div>
              </button>
            )}
          </For>
        </div>
      </section>

      <main ref={mainEl} class="min-w-0 overflow-y-auto px-7 py-6">
        <Show when={selected()} fallback={<EmptyDetail />}>
          <article class="mx-auto max-w-3xl">
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">{detail().source} · {detail().id}</p>
              <h1 class="mt-2 text-20-medium leading-7 text-text-base">{detail().title}</h1>
              <p class="mt-2 text-12-regular text-text-weak">{detail().authors.map((author) => author.name).join(", ") || "Unknown authors"}</p>

              <div class="mt-4 flex flex-wrap items-center gap-2">
                <Button size="small" variant="primary" onClick={() => openInGraph(detail().id)}>Open in graph</Button>
                <Button size="small" variant="secondary" disabled={noting()} onClick={() => void runReadingNote()}>
                  <Show when={noting()} fallback="Reading note"><Spinner class="size-3.5" /></Show>
                </Button>
                <Button size="small" variant="ghost" onClick={() => shell.setDockOpen(true)}>Ask agent</Button>
                <Button size="small" variant="secondary" onClick={() => void toggleFlag("isRead")}>
                  {detail().isRead ? "Mark unread" : "Mark read"}
                </Button>
                <Button size="small" variant="ghost" onClick={() => void toggleFlag("isFavorite")}>
                  {detail().isFavorite ? "Unfavorite" : "Favorite"}
                </Button>
                <Button size="small" variant="ghost" onClick={() => navigate(`/${params.dir}/latex`)}>Insert citation</Button>
                <Button
                  size="small"
                  variant="ghost"
                  title="Requires an archived literature PDF and a configured LIBRETRANSLATE_URL on the server"
                  onClick={() => {
                    if (params.dir && selectedId()) navigate(`/${params.dir}/translate?paperId=${encodeURIComponent(selectedId()!)}`)
                  }}
                >Translate</Button>
              </div>
              <Show when={noteError()}>
                {(error) => <p class="mt-2 text-11-regular text-text-on-critical-strong">{error()}</p>}
              </Show>

              <div class="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-weaker-base bg-border-weaker-base sm:grid-cols-4">
                <Metadata label="Year" value={String(detail().year ?? "Not available")} />
                <Metadata label="Venue" value={detail().venue ?? "Not available"} />
                <Metadata label="Citations" value={detail().citationCount.toLocaleString()} />
                <Metadata label="DOI" value={detail().doi ?? "Not available"} />
              </div>

              <section class="mt-6 border-t border-border-weaker-base pt-5">
                <h2 class="text-13-medium text-text-base">Abstract</h2>
                <p class="mt-2 whitespace-pre-wrap text-12-regular leading-5 text-text-weak">{detail().abstract ?? "No abstract was returned by the selected source."}</p>
              </section>

              <Show when={readingNote()}>
                {(note) => (
                  <section class="mt-6 border-t border-border-weaker-base pt-5">
                    <h2 class="text-13-medium text-text-base">AI reading note</h2>
                    <For each={note().sections}>
                      {(section) => (
                        <div class="mt-3 rounded-md border border-border-weaker-base bg-surface-inset-base px-3 py-2.5">
                          <p class="text-12-medium text-text-base">{section.title}</p>
                          <p class="mt-1 whitespace-pre-wrap text-12-regular leading-5 text-text-weak">{section.body}</p>
                        </div>
                      )}
                    </For>
                    <p class="mt-2 font-mono text-10-regular text-text-weaker">{note().path} · generated by the reading-note session</p>
                  </section>
                )}
              </Show>

              <Show when={relatedSessions().length > 0}>
                <section class="mt-6 border-t border-border-weaker-base pt-5">
                  <h2 class="text-13-medium text-text-base">Related chats</h2>
                  <For each={relatedSessions()}>
                    {(session) => (
                      <button
                        type="button"
                        class="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"
                        onClick={() => navigate(`/${params.dir}/session/${session.id}`)}
                      >
                        <Icon name="speech-bubble" size="small" class="shrink-0 text-text-weak" />
                        <span class="min-w-0 flex-1 truncate text-12-medium text-text-base">{session.title}</span>
                        <span class="shrink-0 text-10-regular text-text-weaker">
                          {DateTime.fromMillis(session.time.updated ?? session.time.created).toRelative()}
                        </span>
                      </button>
                    )}
                  </For>
                </section>
              </Show>

              <section class="mt-6 border-t border-border-weaker-base pt-5" classList={{ "opacity-60 transition-opacity": citations.loading && citations.latest !== undefined }}>
                <div class="flex items-center gap-2">
                  <CitationTab label="References" active={citationTab() === "references"} onClick={() => setCitationTab("references")} />
                  <CitationTab label="Cited by" active={citationTab() === "cited_by"} onClick={() => setCitationTab("cited_by")} />
                </div>
                <Show when={citations.loading && citations.latest === undefined}>
                  <div class="mt-3 flex items-center gap-2 text-12-regular text-text-weak"><Spinner class="size-3.5" /> Loading citations…</div>
                </Show>
                <Show when={!citations.loading && (citations.latest ?? []).length === 0}>
                  <p class="mt-3 text-12-regular text-text-weak">
                    {citationTab() === "references"
                      ? "No references recorded. Import this paper's PDF to parse its reference section."
                      : "No citing papers recorded in the project library yet."}
                  </p>
                </Show>
                <For each={citations.latest ?? []}>
                  {(entry) => (
                    <CitationRow entry={entry} onSelect={entry.inLibrary ? () => setSelectedId(entry.id) : undefined} />
                  )}
                </For>
              </section>

              <section class="mt-6 border-t border-border-weaker-base pt-5" classList={{ "opacity-60 transition-opacity": similar.loading && similar.latest !== undefined }}>
                <h2 class="text-13-medium text-text-base">Similar papers</h2>
                <Show when={similar.latest?.degraded}>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status="degraded"
                      label="Keyword ranking"
                      detail="Embedding vectors are unavailable on this machine; falling back to keyword-based similarity."
                    />
                    <span class="text-11-regular text-text-weak">Embedding vectors unavailable — results use keyword-based ranking.</span>
                  </div>
                </Show>
                <Show when={similar.loading && similar.latest === undefined}>
                  <div class="mt-3 flex items-center gap-2 text-12-regular text-text-weak"><Spinner class="size-3.5" /> Ranking similar papers…</div>
                </Show>
                <Show when={!similar.loading && (similar.latest?.results ?? []).length === 0}>
                  <p class="mt-3 text-12-regular text-text-weak">No similar papers found in the project library yet.</p>
                </Show>
                <For each={similar.latest?.results ?? []}>
                  {(entry) => <SimilarRow entry={entry} onSelect={() => setSelectedId(entry.id)} />}
                </For>
              </section>

              <div class="mt-6 flex items-center gap-2 border-t border-border-weaker-base pt-5">
                <select
                  aria-label="Export format"
                  value={exportFormat()}
                  onChange={(event) => setExportFormat(event.currentTarget.value as ExportFormat)}
                  class="rounded-md border border-border-base bg-surface-inset-base px-2 py-1.5 text-12-regular text-text-base outline-none focus:border-border-focus"
                >
                  <option value="bibtex">BibTeX</option>
                  <option value="ris">RIS</option>
                  <option value="endnote">EndNote</option>
                  <option value="json">JSON</option>
                  <option value="markdown">Markdown</option>
                </select>
                <select
                  aria-label="Citation style (Markdown only)"
                  value={exportStyle()}
                  onChange={(event) => setExportStyle(event.currentTarget.value as CitationStyle | "none")}
                  class="rounded-md border border-border-base bg-surface-inset-base px-2 py-1.5 text-12-regular text-text-base outline-none focus:border-border-focus"
                >
                  <option value="none">No CSL style</option>
                  <option value="ieee">IEEE</option>
                  <option value="acm">ACM</option>
                  <option value="apa">APA</option>
                  <option value="nature">Nature</option>
                  <option value="springer">Springer</option>
                </select>
                <Button size="small" variant="secondary" onClick={() => void exportPaper()}>Export</Button>
                <Button size="small" variant="ghost" onClick={() => void papersActions.refetch()}>Return to local library</Button>
              </div>

              <Show when={exported()}>
                {(content) => (
                  <div class="mt-4 rounded-lg border border-border-weaker-base bg-surface-inset-base p-4">
                    <div class="mb-3 flex items-center justify-between">
                      <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">BibTeX</p>
                      <Button size="small" variant="ghost" onClick={() => void navigator.clipboard?.writeText(content())}>Copy</Button>
                    </div>
                    <pre class="overflow-x-auto whitespace-pre-wrap text-11-regular leading-5 text-text-weak">{content()}</pre>
                  </div>
                )}
              </Show>
            <Show when={exportError()}>{(error) => <p class="mt-3 text-12-regular text-text-on-critical-strong">{error()}</p>}</Show>
          </article>
        </Show>
      </main>
    </div>
  )
}

function PaperContextPanel(props: {
  readonly visible: () => boolean
  readonly pdfPath: () => string | undefined
  readonly notePath: () => string | undefined
  readonly onOpenGraph: () => void
  readonly onInsertCitation: () => void
  readonly onTranslate: () => void
}) {
  const files = createMemo(() => [props.pdfPath(), props.notePath()].filter((path): path is string => !!path))
  return (
    <Show when={props.visible()}>
      <div class="px-3 py-4">
        <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">Destinations</p>
        <div class="mt-2 flex flex-col gap-1">
          <DestinationRow label="Knowledge graph" module="graph" onClick={props.onOpenGraph} />
          <DestinationRow label="Insert citation" module="latex" onClick={props.onInsertCitation} />
          <DestinationRow label="Translate" module="translate" onClick={props.onTranslate} />
        </div>
        <Show when={files().length > 0}>
          <p class="mt-4 font-mono text-10-medium uppercase tracking-wider text-text-weaker">Files</p>
          <div class="mt-2 flex flex-col gap-1.5">
            <For each={files()}>
              {(path) => <p class="break-all font-mono text-11-regular text-text-weak">{path}</p>}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}

function DestinationRow(props: { readonly label: string; readonly module: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"
      onClick={props.onClick}
    >
      <span class="text-12-medium text-text-base">{props.label}</span>
      <Tag>{props.module}</Tag>
    </button>
  )
}

type NoteSection = { readonly title: string; readonly body: string }

// Splits the note on ## / ### headings into titled blocks; frontmatter lines before the
// first heading are not a section and are dropped. No markdown rendering — bodies keep
// their raw text and wrap with whitespace-pre-wrap.
function parseNoteSections(markdown: string): NoteSection[] {
  return markdown
    .split(/^(?=#{2,3}\s)/m)
    .map((chunk) => {
      const [first, ...rest] = chunk.split("\n")
      const title = /^#{2,3}\s+(.+)$/.exec(first ?? "")?.[1]?.trim()
      if (!title) return undefined
      return { title, body: rest.join("\n").trim() }
    })
    .filter((section): section is NoteSection => !!section)
}

function SimilarRow(props: { readonly entry: SimilarEntry; readonly onSelect: () => void }) {
  const score = createMemo(() => finiteNumber(props.entry.score))
  return (
    <button
      type="button"
      class="mt-3 block w-full rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"
      onClick={props.onSelect}
    >
      <p class="text-12-medium leading-5 text-text-base">{props.entry.title}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <Tag>{props.entry.year ?? "n.d."}</Tag>
        <span class="font-mono text-10-regular text-text-weaker">score {score() === undefined ? "n/a" : score()!.toFixed(2)}</span>
      </div>
    </button>
  )
}

function CitationTab(props: { readonly label: string; readonly active: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      class="rounded-md px-2.5 py-1.5 text-12-medium text-text-weak outline-none hover:bg-surface-base-hover"
      classList={{ "bg-surface-base-hover text-text-base": props.active }}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function CitationRow(props: { readonly entry: CitationEntry; readonly onSelect?: () => void }) {
  return (
    <Show
      when={props.onSelect}
      fallback={
        <div class="mt-3">
          <CitationContent entry={props.entry} />
        </div>
      }
    >
      {(select) => (
        <button
          type="button"
          class="mt-3 block w-full rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"
          onClick={select()}
        >
          <CitationContent entry={props.entry} />
        </button>
      )}
    </Show>
  )
}

function CitationContent(props: { readonly entry: CitationEntry }) {
  return (
    <>
      <p class="text-12-medium leading-5 text-text-base">{props.entry.title ?? "Untitled reference"}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <Tag>{props.entry.year ?? "n.d."}</Tag>
        <Tag>{props.entry.source}</Tag>
        <Show when={props.entry.inLibrary}>
          <Tag>in library</Tag>
        </Show>
        <Show when={props.entry.doi}>
          {(doi) => <span class="font-mono text-10-regular text-text-weaker">{doi()}</span>}
        </Show>
      </div>
    </>
  )
}

function CategoryRow(props: { readonly label: string; readonly count: number; readonly selected: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-12-medium text-text-weak outline-none hover:bg-surface-base-hover"
      classList={{ "bg-surface-base-hover text-text-base": props.selected }}
      onClick={props.onClick}
    >
      <span>{props.label}</span>
      <span class="font-mono text-10-regular text-text-weaker">{props.count}</span>
    </button>
  )
}

function Metadata(props: { readonly label: string; readonly value: string }) {
  return (
    <div class="min-w-0 bg-surface-base p-3">
      <p class="text-10-regular text-text-weaker">{props.label}</p>
      <p class="mt-1 truncate text-11-medium text-text-base" title={props.value}>{props.value}</p>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div class="flex h-full items-center justify-center">
      <div class="max-w-sm">
        <h1 class="text-14-medium text-text-base">Select a paper</h1>
        <p class="mt-1 text-12-regular text-text-weak">Metadata, abstract, provenance, and export actions will appear here. Nothing in this view is synthetic.</p>
      </div>
    </div>
  )
}

function readPdfFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) return Promise.reject(new Error("Select a PDF file"))
  if (file.size > 50 * 1024 * 1024) return Promise.reject(new Error("PDF upload exceeds the 50 MB limit"))
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the selected PDF"))
    reader.onload = () => {
      const value = reader.result
      if (typeof value !== "string" || !value.startsWith("data:application/pdf;base64,")) {
        reject(new Error("The selected file is not a valid PDF"))
        return
      }
      resolve(value.slice(value.indexOf(",") + 1))
    }
    reader.readAsDataURL(file)
  })
}

function finiteNumber(value: number | string | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return value
}
