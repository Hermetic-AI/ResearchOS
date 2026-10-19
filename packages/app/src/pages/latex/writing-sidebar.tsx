import { Button } from "@opencode/ui/button"
import { For, Show, createMemo, createSignal } from "solid-js"
import { useResearchosShell } from "@/components/researchos/shell-context"

type Tab = "titles" | "structure" | "polish" | "typeset" | "citations"
type OutlineItem = { level: number; title: string; line: number }
type DiffResult = {
  parts: ReadonlyArray<{ value: string; added?: boolean; removed?: boolean }>
  hunks: ReadonlyArray<{ index: number; original: string; revised: string }>
}
type Paper = { id: string; title: string; year: number | null; authors: ReadonlyArray<{ name: string }> }

export function WritingSidebar(props: {
  file?: string
  bibFile?: string
  outline: ReadonlyArray<OutlineItem>
  selectedText: string
  onRevealLine: (line: number) => void
  onInsert: (text: string) => void
  onReplaceSelection: (text: string) => void
  convertTable: (input: { csv: string; caption?: string; label?: string }) => Promise<string>
  convertMarkdown: (markdown: string) => Promise<string>
  diff: (original: string, revised: string) => Promise<DiffResult>
  applyDiff: (original: string, revised: string, accepted: number[]) => Promise<string>
  searchPapers: (query: string) => Promise<ReadonlyArray<Paper>>
  addCitation: (paperId: string) => Promise<string>
  recordRewrite: (input: { original: string; output: string; status: "accepted" | "partial" }) => Promise<void>
}) {
  const shell = useResearchosShell()
  const [tab, setTab] = createSignal<Tab>("structure")
  const [input, setInput] = createSignal("")
  const [caption, setCaption] = createSignal("")
  const [label, setLabel] = createSignal("")
  const [mode, setMode] = createSignal<"csv" | "markdown">("csv")
  const [generated, setGenerated] = createSignal("")
  const [revised, setRevised] = createSignal("")
  const [review, setReview] = createSignal<DiffResult>()
  const [accepted, setAccepted] = createSignal(new Set<number>())
  const [query, setQuery] = createSignal("")
  const [papers, setPapers] = createSignal<ReadonlyArray<Paper>>([])
  const [busy, setBusy] = createSignal(false)
  const [notice, setNotice] = createSignal<string>()
  const selected = createMemo(() => props.selectedText.trim())

  const askAgent = (kind: "titles" | "structure") => {
    const prompt = kind === "titles"
      ? `@paper-writer Generate 5 concise academic title candidates for ${props.file ?? "the current paper"}. Base them on this excerpt:\n\n${selected() || "Please inspect the LaTeX project before proposing titles."}`
      : `@paper-writer Review the structure of ${props.file ?? "the current paper"}. Return a proposed outline as a diff and do not edit files until I approve.`
    shell.setPendingPrompt(prompt)
    shell.setDockOpen(true)
  }

  return (
    <aside class="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-border-weak-base bg-background-base">
      <div class="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-border-weak-base px-2">
        <For each={["titles", "structure", "polish", "typeset", "citations"] as Tab[]}>
          {(item) => <button
            class="h-9 border-b-2 px-2 text-10-medium uppercase tracking-wide"
            classList={{
              "border-border-focus text-text-base": tab() === item,
              "border-transparent text-text-weak hover:text-text-base": tab() !== item,
            }}
            onClick={() => { setTab(item); setNotice(undefined) }}
          >{item}</button>}
        </For>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3 text-12-regular text-text-weak">
        <Show when={notice()}>{(value) => <p class="mb-3 rounded-md border border-border-weak-base bg-background-stronger p-2 leading-5">{value()}</p>}</Show>

        <Show when={tab() === "titles"}>
          <PanelTitle title="Title candidates" description="Title generation requires a model turn. ResearchOS injects a scoped prompt directly into the companion chat." />
          <Button size="small" variant="neutral" onClick={() => askAgent("titles")}>Ask @paper-writer</Button>
        </Show>

        <Show when={tab() === "structure"}>
          <PanelTitle title="Document structure" description={`${props.outline.length} headings parsed from the current source.`} />
          <div class="mb-4 space-y-0.5">
            <For each={props.outline}>{(item) => <button
              class="block w-full truncate rounded px-2 py-1 text-left hover:bg-background-stronger hover:text-text-base"
              style={{ "padding-left": `${Math.max(8, (item.level - 2) * 10)}px` }}
              onClick={() => props.onRevealLine(item.line)}
            >{item.title}<span class="ml-2 text-text-weaker">L{item.line}</span></button>}</For>
            <Show when={props.outline.length === 0}><p>No section commands in this file.</p></Show>
          </div>
          <Button size="small" variant="neutral" onClick={() => askAgent("structure")}>Request structure review</Button>
        </Show>

        <Show when={tab() === "polish"}>
          <PanelTitle title="Review a rewrite" description="Select source text, paste a model or human revision, then approve sentence-level hunks before applying." />
          <p class="mb-2 line-clamp-4 rounded bg-background-stronger p-2 text-text-base">{selected() || "Select text in the editor first."}</p>
          <textarea class={textareaClass} rows={6} value={revised()} onInput={(event) => setRevised(event.currentTarget.value)} placeholder="Paste the proposed revision…" />
          <div class="mt-2 flex gap-2">
            <Button size="small" variant="neutral" disabled={!selected() || !revised().trim() || busy()} onClick={() => {
              setBusy(true)
              void props.diff(selected(), revised()).then((result) => {
                setReview(result)
                setAccepted(new Set(result.hunks.map((hunk) => hunk.index)))
              }).finally(() => setBusy(false))
            }}>Build review</Button>
          </div>
          <Show when={review()}>{(result) => <>
            <div class="my-3 rounded border border-border-weak-base p-2 leading-5">
              <For each={result().parts}>{(part) => <span classList={{
                "bg-green-500/15 text-green-700 dark:text-green-300": part.added,
                "bg-red-500/15 text-red-700 line-through dark:text-red-300": part.removed,
              }}>{part.value}</span>}</For>
            </div>
            <div class="space-y-2">
              <For each={result().hunks}>{(hunk) => <label class="flex cursor-pointer gap-2 rounded border border-border-weak-base p-2">
                <input type="checkbox" checked={accepted().has(hunk.index)} onChange={(event) => setAccepted((current) => {
                  const next = new Set(current)
                  event.currentTarget.checked ? next.add(hunk.index) : next.delete(hunk.index)
                  return next
                })} />
                <span class="min-w-0"><span class="block text-text-weaker line-through">{hunk.original || "∅"}</span><span class="block text-text-base">{hunk.revised || "∅"}</span></span>
              </label>}</For>
            </div>
            <Button class="mt-3" size="small" variant="submit" onClick={() => {
              setBusy(true)
              const indexes = [...accepted()]
              void props.applyDiff(selected(), revised(), indexes).then(async (text) => {
                props.onReplaceSelection(text)
                await props.recordRewrite({ original: selected(), output: text, status: indexes.length === result().hunks.length ? "accepted" : "partial" })
                setNotice("Accepted hunks applied to the editor. Save to persist the file.")
              }).finally(() => setBusy(false))
            }}>Apply accepted hunks</Button>
          </>}</Show>
        </Show>

        <Show when={tab() === "typeset"}>
          <PanelTitle title="Deterministic typesetting" description="Convert inline CSV or Markdown using the writing-core implementation." />
          <div class="mb-2 flex gap-1">
            <Button size="small" variant={mode() === "csv" ? "submit" : "ghost"} onClick={() => setMode("csv")}>CSV table</Button>
            <Button size="small" variant={mode() === "markdown" ? "submit" : "ghost"} onClick={() => setMode("markdown")}>Markdown</Button>
          </div>
          <Show when={mode() === "csv"}>
            <input class={inputClass} value={caption()} onInput={(event) => setCaption(event.currentTarget.value)} placeholder="Caption (optional)" />
            <input class={`${inputClass} mt-2`} value={label()} onInput={(event) => setLabel(event.currentTarget.value)} placeholder="Label (optional)" />
          </Show>
          <textarea class={`${textareaClass} mt-2`} rows={9} value={input()} onInput={(event) => setInput(event.currentTarget.value)} placeholder={mode() === "csv" ? "Method,Score\nOurs,92.4" : "## Method\n\nDescribe the method…"} />
          <Button class="mt-2" size="small" variant="neutral" disabled={!input().trim() || busy()} onClick={() => {
            setBusy(true)
            const task = mode() === "csv" ? props.convertTable({ csv: input(), ...(caption() ? { caption: caption() } : {}), ...(label() ? { label: label() } : {}) }) : props.convertMarkdown(input())
            void task.then(setGenerated).finally(() => setBusy(false))
          }}>Convert</Button>
          <Show when={generated()}><>
            <pre class="my-3 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background-stronger p-2 font-mono text-11-regular text-text-base">{generated()}</pre>
            <Button size="small" variant="submit" onClick={() => props.onInsert(generated())}>Insert at selection</Button>
          </></Show>
        </Show>

        <Show when={tab() === "citations"}>
          <PanelTitle title="Citation assistant" description={props.bibFile ? `Resolved entries are merged into ${props.bibFile}.` : "Add a .bib file before inserting citations."} />
          <div class="flex gap-2">
            <input class={inputClass} value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search title, DOI, or topic" />
            <Button size="small" variant="neutral" disabled={!query().trim() || busy()} onClick={() => {
              setBusy(true)
              void props.searchPapers(query()).then(setPapers).finally(() => setBusy(false))
            }}>Search</Button>
          </div>
          <div class="mt-3 space-y-2">
            <For each={papers()}>{(paper) => <article class="rounded border border-border-weak-base p-2">
              <h3 class="text-12-medium leading-5 text-text-base">{paper.title}</h3>
              <p class="mt-1 text-10-regular">{paper.authors.slice(0, 2).map((author) => author.name).join(", ")}{paper.year ? ` · ${paper.year}` : ""}</p>
              <Button class="mt-2" size="small" variant="ghost" disabled={!props.bibFile || busy()} onClick={() => {
                setBusy(true)
                void props.addCitation(paper.id).then((key) => {
                  props.onInsert(`\\cite{${key}}`)
                  setNotice(`Inserted \\cite{${key}} and updated ${props.bibFile}.`)
                }).finally(() => setBusy(false))
              }}>Add citation</Button>
            </article>}</For>
          </div>
        </Show>
      </div>
    </aside>
  )
}

function PanelTitle(props: { title: string; description: string }) {
  return <div class="mb-3"><h2 class="text-13-medium text-text-base">{props.title}</h2><p class="mt-1 leading-5">{props.description}</p></div>
}

const inputClass = "h-8 min-w-0 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-12-regular text-text-base outline-none focus:border-border-focus"
const textareaClass = "w-full resize-y rounded border border-border-weak-base bg-background-stronger p-2 font-mono text-11-regular leading-5 text-text-base outline-none focus:border-border-focus"
