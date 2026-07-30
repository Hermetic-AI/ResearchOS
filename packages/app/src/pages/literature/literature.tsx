import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tag } from "@opencode-ai/ui/tag"
import type { ServerResearchosLiteratureCitationsOutput, ServerResearchosLiteratureSimilarOutput } from "@opencode-ai/client"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"

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
  const [importPath, setImportPath] = createSignal("")
  const [importUrl, setImportUrl] = createSignal("")
  const [importing, setImporting] = createSignal(false)
  const [importError, setImportError] = createSignal<string>()
  const [importNotice, setImportNotice] = createSignal<string>()
  const [zoteroPath, setZoteroPath] = createSignal("")
  const [importingZotero, setImportingZotero] = createSignal(false)
  const [zoteroError, setZoteroError] = createSignal<string>()
  const [zoteroNotice, setZoteroNotice] = createSignal<string>()
  const [citationTab, setCitationTab] = createSignal<CitationDirection>("references")
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
      setSearchError(error instanceof Error ? error.message : String(error))
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

  const insertCitation = async () => {
    const paper = selected()
    if (!paper) return
    const bib = await client().export({ location: { directory: sdk().directory }, paperIds: paper.id, format: "bibtex" })
    const match = /@\w+\{([^,]+),/.exec(bib.data.content)
    const key = match?.[1] ?? paper.id
    const citation = `\\cite{${key}}`
    await navigator.clipboard?.writeText(`${citation}\n\n${bib.data.content}`)
  }

  const exportPaper = async () => {
    const paper = selected()
    if (!paper) return
    const style = exportStyle()
    const result = await client().export({
      location: { directory: sdk().directory },
      paperIds: paper.id,
      format: exportFormat(),
      ...(style === "none" ? {} : { style }),
    })
    setExported(result.data.content)
  }

  const runImport = async () => {
    const path = importPath().trim()
    const url = importUrl().trim()
    if ((!path && !url) || importing()) return
    setImporting(true)
    setImportError(undefined)
    setImportNotice(undefined)
    const result = await client().import({
      location: { directory: sdk().directory },
      path: path || undefined,
      url: url || undefined,
    }).then((response) => response.data).catch((error: unknown) => {
      setImportError(error instanceof Error ? error.message : String(error))
      return undefined
    })
    if (result) {
      setImportNotice(`Imported · metadata from ${result.metadataSource ?? "pdf"} · ${result.references ?? 0} references parsed`)
      setImportPath("")
      setImportUrl("")
      await papersActions.refetch()
      setCategory("all")
      if (result.paper) setSelectedId(result.paper.id)
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
      setZoteroError(error instanceof Error ? error.message : String(error))
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
          <div class="mt-2 flex gap-2">
            <input
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
            <Button size="small" variant="secondary" disabled={(!importPath().trim() && !importUrl().trim()) || importing()} onClick={() => void runImport()}>
              <Show when={importing()} fallback="Import PDF"><Spinner class="size-3.5" /></Show>
            </Button>
          </div>
          <Show when={importError()}>{(error) => <p class="mt-2 text-11-regular text-text-on-critical-strong">{error()}</p>}</Show>
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
          <Show when={zoteroError()}>{(error) => <p class="mt-2 text-11-regular text-text-on-critical-strong">{error()}</p>}</Show>
          <Show when={zoteroNotice()}>{(notice) => <p class="mt-2 text-11-regular text-text-weak">{notice()}</p>}</Show>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show when={papers.loading}>
            <div class="flex items-center gap-2 px-4 py-8 text-12-regular text-text-weak"><Spinner class="size-4" /> Loading local library…</div>
          </Show>
          <Show when={!papers.loading && visible().length === 0}>
            <div class="px-5 py-10">
              <h2 class="text-13-medium text-text-base">No papers in this view</h2>
              <p class="mt-1 text-12-regular text-text-weak">Search the four academic sources above; accepted results are stored in the project library automatically.</p>
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

      <main class="min-w-0 overflow-y-auto px-7 py-6">
        <Show when={selected()} fallback={<EmptyDetail />}>
          {(paper) => (
            <article class="mx-auto max-w-3xl">
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">{paper().source} · {paper().id}</p>
              <h1 class="mt-2 text-20-medium leading-7 text-text-base">{paper().title}</h1>
              <p class="mt-2 text-12-regular text-text-weak">{paper().authors.map((author) => author.name).join(", ") || "Unknown authors"}</p>

              <div class="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-weaker-base bg-border-weaker-base sm:grid-cols-4">
                <Metadata label="Year" value={String(paper().year ?? "Not available")} />
                <Metadata label="Venue" value={paper().venue ?? "Not available"} />
                <Metadata label="Citations" value={paper().citationCount.toLocaleString()} />
                <Metadata label="DOI" value={paper().doi ?? "Not available"} />
              </div>

              <section class="mt-6 border-t border-border-weaker-base pt-5">
                <h2 class="text-13-medium text-text-base">Abstract</h2>
                <p class="mt-2 whitespace-pre-wrap text-12-regular leading-5 text-text-weak">{paper().abstract ?? "No abstract was returned by the selected source."}</p>
              </section>

              <section class="mt-6 border-t border-border-weaker-base pt-5">
                <div class="flex items-center gap-2">
                  <CitationTab label="References" active={citationTab() === "references"} onClick={() => setCitationTab("references")} />
                  <CitationTab label="Cited by" active={citationTab() === "cited_by"} onClick={() => setCitationTab("cited_by")} />
                </div>
                <Show when={citations.loading}>
                  <div class="mt-3 flex items-center gap-2 text-12-regular text-text-weak"><Spinner class="size-3.5" /> Loading citations…</div>
                </Show>
                <Show when={!citations.loading && (citations() ?? []).length === 0}>
                  <p class="mt-3 text-12-regular text-text-weak">
                    {citationTab() === "references"
                      ? "No references recorded. Import this paper's PDF to parse its reference section."
                      : "No citing papers recorded in the project library yet."}
                  </p>
                </Show>
                <For each={citations() ?? []}>
                  {(entry) => (
                    <CitationRow entry={entry} onSelect={entry.inLibrary ? () => setSelectedId(entry.id) : undefined} />
                  )}
                </For>
              </section>

              <section class="mt-6 border-t border-border-weaker-base pt-5">
                <h2 class="text-13-medium text-text-base">Similar papers</h2>
                <Show when={similar()?.degraded}>
                  <p class="mt-2 text-11-regular text-text-weak">Keyword-based ranking — embedding vectors are unavailable on this machine.</p>
                </Show>
                <Show when={similar.loading}>
                  <div class="mt-3 flex items-center gap-2 text-12-regular text-text-weak"><Spinner class="size-3.5" /> Ranking similar papers…</div>
                </Show>
                <Show when={!similar.loading && (similar()?.results ?? []).length === 0}>
                  <p class="mt-3 text-12-regular text-text-weak">No similar papers found in the project library yet.</p>
                </Show>
                <For each={similar()?.results ?? []}>
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
                <Button size="small" variant="ghost" onClick={() => void insertCitation()}>Insert citation</Button>
                <Button size="small" variant="ghost" onClick={() => void toggleFlag("isRead")}>
                  {selected()?.isRead ? "Mark unread" : "Mark read"}
                </Button>
                <Button size="small" variant="ghost" onClick={() => void toggleFlag("isFavorite")}>
                  {selected()?.isFavorite ? "Unfavorite" : "Favorite"}
                </Button>
                <Button size="small" variant="ghost" onClick={() => {
                  if (params.dir && selectedId()) navigate(`/${base64Encode(params.dir)}/translate?paperId=${encodeURIComponent(selectedId()!)}`)
                }}>Translate</Button>
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
            </article>
          )}
        </Show>
      </main>
    </div>
  )
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

function finiteNumber(value: number | string | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return value
}
