import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import type {
  ServerResearchosLatexLatexCompileOutput,
  ServerResearchosLatexLatexFormatCheckOutput,
} from "@opencode/client"
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { useResearchosDirectory } from "@/components/researchos-rail"
import { createResearchosClient } from "@/utils/researchos-client"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { MonacoLatex } from "./monaco-latex"
import { PreviewPane } from "./preview-pane"
import { WritingSidebar } from "./writing-sidebar"

type Compile = ServerResearchosLatexLatexCompileOutput["data"]
type FormatIssue = ServerResearchosLatexLatexFormatCheckOutput["data"]["issues"][number]
type Diagnostic = { file: string; line: number; message: string; severity: "error" | "warning" | "info"; rule?: string }
type Selection = { text: string; start: number; end: number }
type OutlineItem = { level: number; title: string; line: number }

export default function LatexPage() {
  const directory = useResearchosDirectory()
    const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const rootClient = createMemo(() => createResearchosClient({
    baseUrl: serverSDK.url,
    fetch: platform.fetch,
    password: serverSDK.server.http.password,
  }))
  const latex = createMemo(() => rootClient()["server.researchos-latex"].latex)
  const writing = createMemo(() => rootClient()["server.researchos-writing"].writing)
  const literature = createMemo(() => rootClient()["server.researchos-literature"].literature)
  const location = () => ({ directory: directory() })

  const [files, filesActions] = createResource(() => directory(), async () => latex().files({ location: location() }).then((result) => result.data.files))
  const [selectedFile, setSelectedFile] = createSignal<string>()
  const [mainFile, setMainFile] = createSignal<string>()
  const [source] = createResource(selectedFile, async (file) => latex().source({ location: location(), file }).then((result) => result.data))
  const [content, setContent] = createSignal("")
  const [saved, setSaved] = createSignal("")
  const [citationKeys, setCitationKeys] = createSignal<string[]>([])
  const [selection, setSelection] = createSignal<Selection>({ text: "", start: 0, end: 0 })
  const [cursorLine, setCursorLine] = createSignal(1)
  const [revealLine, setRevealLine] = createSignal<number>()
  const [diagnostics, setDiagnostics] = createSignal<Diagnostic[]>([])
  const [compileResult, setCompileResult] = createSignal<Compile>()
  const [pdf, setPdf] = createSignal<string>()
  const [pdfTarget, setPdfTarget] = createSignal<{ page: number; x: number; y: number }>()
  const [compiledPdfPath, setCompiledPdfPath] = createSignal<string>()
  const [status, setStatus] = createSignal("Loading project sources…")
  const [busy, setBusy] = createSignal(false)
  const [logOpen, setLogOpen] = createSignal(true)
  const dirty = createMemo(() => content() !== saved())
  const bibFile = createMemo(() => files()?.find((file) => file.endsWith(".bib")))
  const liveOutline = createMemo(() => parseOutline(content()))
  const [builds] = createResource(() => directory(), async () => latex().builds({ location: location(), limit: 20 }).then((result) => result.data.builds))

  createEffect(() => {
    const available = files()
    if (!available || selectedFile()) return
    const first = available.find((file) => file.endsWith(".tex")) ?? available[0]
    setSelectedFile(first)
    setMainFile(available.find((file) => /(^|\/)main\.tex$/i.test(file)) ?? (first?.endsWith(".tex") ? first : undefined))
    setStatus(available.length ? `${available.length} source files` : "No .tex or .bib files found")
  })

  createEffect(() => {
    const loaded = source()
    if (!loaded) return
    setContent(loaded.content)
    setSaved(loaded.content)
    setSelection({ text: "", start: 0, end: 0 })
    if (loaded.file.endsWith(".tex") && loaded.content.includes("\\documentclass")) setMainFile(loaded.file)
    setStatus(`Opened ${loaded.file}`)
  })

  createEffect(() => {
    const bibliography = files()?.filter((file) => file.endsWith(".bib")) ?? []
    if (!bibliography.length) {
      setCitationKeys([])
      return
    }
    void Promise.all(bibliography.map((file) => latex().source({ location: location(), file }).then((result) => result.data.bibliography)))
      .then((entries) => setCitationKeys([...new Set(entries.flat().map((entry) => entry.key))].sort()))
      .catch(() => setCitationKeys([]))
  })

  createEffect(() => {
    const latest = builds()?.find((build) => build.status === "success" && build.pdfPath)
    if (!latest || pdf()) return
    setMainFile((current) => current ?? latest.mainFile)
    setCompiledPdfPath(latest.pdfPath ?? undefined)
    void latex().pdf({ location: location(), mainFile: latest.mainFile }).then((result) => setPdf(result.data.data)).catch(() => {})
  })

  createEffect(() => {
    const file = selectedFile() ?? mainFile()
    shell.setAgentContext(file ? { module: "latex", resource: file } : { module: "latex" })
  })
  onCleanup(() => shell.setAgentContext(undefined))

  const save = async () => {
    const file = selectedFile()
    if (!file || !dirty()) return
    setBusy(true)
    setStatus(`Saving ${file}…`)
    await latex().source_write({ location: location(), file, content: content() })
      .then(() => { setSaved(content()); setStatus(`Saved ${file}`) })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false))
  }

  const compile = async () => {
    const main = mainFile()
    if (!main) {
      setStatus("Choose a .tex main file before compiling")
      return
    }
    if (dirty()) await save()
    setBusy(true)
    setStatus(`Compiling ${main} with Tectonic…`)
    await latex().compile({ location: location(), mainFile: main }).then(async (result) => {
      const value = result.data
      setCompileResult(value)
      if (!value.available) {
        setDiagnostics([])
        setStatus(value.message)
        return
      }
      setDiagnostics(value.errors.map((error) => ({ ...error, line: finiteNumber(error.line) ?? 0 })))
      setStatus(value.ok ? `Build succeeded in ${value.durationMs} ms` : `Build failed with ${value.errors.length} diagnostics`)
      if (!value.ok) return
      setCompiledPdfPath(value.pdfPath ?? undefined)
      const artifact = await latex().pdf({ location: location(), mainFile: main })
      setPdf(artifact.data.data)
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false))
  }

  const checkFormat = async () => {
    const main = mainFile()
    if (!main) return
    setBusy(true)
    setStatus("Checking LaTeX structure and template rules…")
    await latex().format_check({ location: location(), mainFile: main }).then((result) => {
      setDiagnostics(result.data.issues.map((issue: FormatIssue) => ({ ...issue, line: finiteNumber(issue.line) ?? 0 })))
      setStatus(result.data.issues.length ? `${result.data.issues.length} format issues` : "Format check passed")
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false))
  }

  const forwardSync = async () => {
    const main = mainFile()
    const file = selectedFile()
    if (!main || !file) return
    const result = await latex().synctex({ location: location(), mainFile: main, file, line: cursorLine() }).then((response) => response.data)
    const page = finiteNumber(result.page)
    const x = finiteNumber(result.x)
    const y = finiteNumber(result.y)
    if (result.found && page && x !== undefined && y !== undefined) {
      setPdfTarget({ page, x, y })
      setStatus(`Source line ${cursorLine()} → PDF page ${page}`)
      return
    }
    setStatus(result.reason ?? "No SyncTeX match")
  }

  const inverseSync = async (position: { page: number; x: number; y: number }) => {
    const pdfPath = compiledPdfPath()
    if (!pdfPath) return
    const hit = await latex().synctex({ location: location(), pdfPath, ...position }).then((response) => response.data)
    const line = finiteNumber(hit.line)
    if (!hit.found || !hit.file || !line) {
      setStatus(hit.reason ?? "No source location found")
      return
    }
    const match = files()?.find((file) => hit.file!.replaceAll("\\", "/").endsWith(file))
    if (match && match !== selectedFile()) setSelectedFile(match)
    setRevealLine(line)
    setStatus(`PDF page ${position.page} → ${match ?? hit.file}:${line}`)
  }

  const replaceSelection = (text: string) => {
    const range = selection()
    setContent(`${content().slice(0, range.start)}${text}${content().slice(range.end)}`)
    setSelection({ text: "", start: range.start + text.length, end: range.start + text.length })
  }

  const switchFile = async (file: string) => {
    if (file === selectedFile()) return
    if (dirty()) await save()
    setSelectedFile(file)
  }

  return (
    <main class="flex h-full min-h-0 flex-col bg-background-base text-text-base">
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border-weak-base px-3">
        <div class="mr-2 min-w-0">
          <h1 class="truncate text-13-medium">LaTeX workbench</h1>
          <p class="truncate text-10-regular text-text-weak">{status()}</p>
        </div>
        <Button size="small" variant="submit" disabled={busy() || !mainFile()} onClick={() => void compile()}>{busy() ? "Working…" : "Compile"}</Button>
        <Button size="small" variant="neutral" disabled={busy() || !dirty()} onClick={() => void save()}>Save{dirty() ? " •" : ""}</Button>
        <Button size="small" variant="ghost" disabled={busy() || !mainFile()} onClick={() => void checkFormat()}>Format check</Button>
        <Button size="small" variant="ghost" disabled={!pdf()} onClick={() => void forwardSync()}>Locate in PDF</Button>
        <div class="ml-auto flex items-center gap-2 text-10-regular text-text-weak">
          <span>{mainFile() ?? "No main file"}</span>
          <span class="rounded border border-border-weak-base px-1.5 py-0.5">Tectonic</span>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <nav class="flex w-48 shrink-0 flex-col border-r border-border-weak-base bg-background-stronger">
          <div class="flex h-9 items-center justify-between border-b border-border-weak-base px-3 text-10-medium uppercase tracking-wide text-text-weak">
            <span>Sources</span><button class="hover:text-text-base" onClick={() => void filesActions.refetch()}>↻</button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
            <Show when={files.loading}><div class="flex justify-center p-4"><Spinner class="size-4" /></div></Show>
            <For each={files()}>{(file) => <button
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-11-regular hover:bg-background-base"
              classList={{ "bg-background-base text-text-base": selectedFile() === file, "text-text-weak": selectedFile() !== file }}
              onClick={() => void switchFile(file)}
            >
              <span class={file.endsWith(".bib") ? "text-icon-warning-base" : "text-icon-info-base"}>{file.endsWith(".bib") ? "B" : "T"}</span>
              <span class="min-w-0 flex-1 truncate">{file}</span>
              <Show when={mainFile() === file}><span title="Main file">●</span></Show>
            </button>}</For>
          </div>
          <Show when={selectedFile()?.endsWith(".tex")}><button class="border-t border-border-weak-base p-2 text-10-regular text-text-weak hover:text-text-base" onClick={() => setMainFile(selectedFile())}>Set current as main</button></Show>
        </nav>

        <section class="flex min-w-0 flex-1 flex-col">
          <div class="grid min-h-0 flex-1 grid-cols-2">
            <div class="min-h-0 border-r border-border-weak-base">
              <Show when={selectedFile()} fallback={<div class="flex h-full items-center justify-center text-12-regular text-text-weak">Open a LaTeX source</div>}>
                <MonacoLatex
                  file={selectedFile()!}
                  content={content()}
                  citations={citationKeys()}
                  markers={diagnostics().filter((item) => !item.file || item.file.replaceAll("\\", "/").endsWith(selectedFile()!))}
                  revealLine={revealLine()}
                  onChange={setContent}
                  onCursor={setCursorLine}
                  onSelection={setSelection}
                />
              </Show>
            </div>
            <PreviewPane data={pdf()} target={pdfTarget()} onLocate={(position) => void inverseSync(position)} />
          </div>
          <section class="shrink-0 border-t border-border-weak-base" classList={{ "h-40": logOpen(), "h-8": !logOpen() }}>
            <button class="flex h-8 w-full items-center justify-between px-3 text-10-medium uppercase tracking-wide text-text-weak hover:text-text-base" onClick={() => setLogOpen(!logOpen())}>
              <span>Diagnostics · {diagnostics().length}</span><span>{logOpen() ? "⌄" : "⌃"}</span>
            </button>
            <Show when={logOpen()}>
              <div class="h-[calc(100%-2rem)] overflow-auto border-t border-border-weak-base font-mono text-11-regular">
                <Show when={diagnostics().length === 0}><p class="p-3 text-text-weak">{buildLog(compileResult())}</p></Show>
                <For each={diagnostics()}>{(item) => <button class="grid w-full grid-cols-[70px_110px_1fr] gap-2 border-b border-border-weak-base px-3 py-1.5 text-left hover:bg-background-stronger" onClick={() => {
                  const match = files()?.find((file) => item.file.replaceAll("\\", "/").endsWith(file))
                  if (match) setSelectedFile(match)
                  setRevealLine(Math.max(1, item.line))
                }}>
                  <span class={item.severity === "error" ? "text-text-on-critical-strong" : "text-text-on-warning-strong"}>{item.severity}</span>
                  <span class="truncate text-text-weak">{item.file || selectedFile()}:{item.line || "—"}</span>
                  <span class="truncate text-text-base">{item.rule ? `[${item.rule}] ` : ""}{item.message}</span>
                </button>}</For>
              </div>
            </Show>
          </section>
        </section>

        <WritingSidebar
          file={selectedFile()}
          bibFile={bibFile()}
          outline={liveOutline()}
          selectedText={selection().text}
          onRevealLine={setRevealLine}
          onInsert={replaceSelection}
          onReplaceSelection={replaceSelection}
          convertTable={(input) => writing().table({ location: location(), ...input }).then((result) => result.data.text)}
          convertMarkdown={(markdown) => writing().md2latex({ location: location(), markdown }).then((result) => result.data.text)}
          diff={(original, revised) => writing().diff({ location: location(), original, revised }).then((result) => ({
            parts: result.data.parts.map((part) => ({ value: part.value, ...(part.added ? { added: true } : {}), ...(part.removed ? { removed: true } : {}) })),
            hunks: result.data.hunks.map((hunk) => ({ index: finiteNumber(hunk.index) ?? 0, original: hunk.original, revised: hunk.revised })),
          }))}
          applyDiff={(original, revised, accepted) => writing().diff_apply({ location: location(), original, revised, accepted }).then((result) => result.data.text)}
          searchPapers={(query) => literature().search({ location: location(), query, limit: 10 }).then((result) => result.data.map((paper) => ({
            id: paper.id,
            title: paper.title,
            year: finiteNumber(paper.year) ?? null,
            authors: paper.authors ?? [],
          })))}
          addCitation={async (paperId) => {
            const bib = bibFile()
            if (!bib) throw new Error("No .bib file in this project")
            const resolved = await writing().bibtex_library({ location: location(), paperIds: [paperId] }).then((result) => result.data)
            const entry = resolved.entries[0]
            if (!entry) throw new Error("Paper has no local BibTeX record")
            await writing().bibtex_upsert({ location: location(), bibFile: bib, entries: [entry] })
            setCitationKeys((keys) => [...new Set([...keys, entry.key])].sort())
            return entry.key
          }}
          recordRewrite={async ({ original, output, status }) => {
            await writing().suggestion_record({ location: location(), kind: "rewrite", targetFile: selectedFile(), inputExcerpt: original, output, status })
          }}
        />
      </div>
    </main>
  )
}

function finiteNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}

function buildLog(result?: Compile) {
  if (!result) return "Compile or run format check to populate diagnostics."
  if (!result.available) return `${result.message}\n${result.installHint}`
  return result.log || "No diagnostics."
}

function parseOutline(content: string): OutlineItem[] {
  const levels: Record<string, number> = { part: 1, chapter: 2, section: 3, subsection: 4, subsubsection: 5, paragraph: 6 }
  return content.split("\n").flatMap((line, index) => {
    const match = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]*)\}/.exec(line)
    if (!match?.[1] || !match[2]) return []
    return [{ level: levels[match[1]] ?? 3, title: match[2], line: index + 1 }]
  })
}
