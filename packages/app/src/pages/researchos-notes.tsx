import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { createResearchosClient } from "@/utils/researchos-client"
import { showToast } from "@/utils/toast"

type Note = {
  readonly path: string
  readonly title: string
  readonly date: string
  readonly preview: string
  readonly tags: string[]
}

type Paper = {
  readonly id: string
  readonly title: string
  readonly year?: number | string | null
  readonly authors: ReadonlyArray<{ name: string }>
}

export default function NotesPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const client = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-assets"])

  const [linking, setLinking] = createSignal<string>()
  const [searchQuery, setSearchQuery] = createSignal("")
  const [searchResults, setSearchResults] = createSignal<ReadonlyArray<Paper>>([])

  const literature = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-literature"])

  const [notes, notesActions] = createResource(() => sdk().directory, async (directory) => {
    const [quick, literature] = await Promise.all([
      sdk().client.file.list({ path: "notes/quick" }).catch(() => undefined),
      sdk().client.file.list({ path: "notes/literature" }).catch(() => undefined),
    ])
    const paths = [
      ...(quick?.data ?? []).filter((item) => item.type === "file").map((item) => item.path),
      ...(literature?.data ?? []).filter((item) => item.type === "file").map((item) => item.path),
    ]
    const items = await Promise.all(
      paths.map(async (path) => {
        const result = await sdk().client.file.read({ path }).catch(() => undefined)
        const content = result?.data?.type === "text" ? result.data.content : ""
        return parseNote(path, content)
      }),
    )
    return items.filter((item) => !!item).sort((a, b) => b.date.localeCompare(a.date))
  })

  const askAgent = (note: Note) => {
    shell.setPendingPrompt(`Based on this note, help me expand it:\n\n${note.preview}`)
    shell.setDockOpen(true)
  }

  const openInGraph = (note: Note) => {
    navigate(`/${params.dir}/graph?note=${encodeURIComponent(note.path)}`)
  }

  const searchPapers = async () => {
    const query = searchQuery().trim()
    if (!query) return
    const result = await literature().search({ location: { directory: sdk().directory }, query, limit: 10 }).catch(() => undefined)
    setSearchResults(result?.data ?? [])
  }

  const linkPaper = async (note: Note, paper: Paper) => {
    const current = await sdk().client.file.read({ path: note.path }).catch(() => undefined)
    const content = current?.data?.type === "text" ? current.data.content : ""
    const link = `\n\nRelated: [[paper:${paper.id}]] ${paper.title}${paper.year ? ` (${paper.year})` : ""}`
    await client().noteWrite({
      location: { directory: sdk().directory },
      path: note.path,
      content: content + link,
    })
    setLinking(undefined)
    setSearchQuery("")
    setSearchResults([])
    await notesActions.refetch()
    showToast({ title: "Linked to paper", description: paper.title, variant: "success" })
  }

  return (
    <main class="h-full overflow-y-auto bg-background-stronger p-6 text-text-base">
      <div class="mx-auto max-w-4xl">
        <header class="mb-6">
          <p class="text-10-medium uppercase tracking-[0.18em] text-text-weak">ResearchOS</p>
          <h1 class="mt-1 text-20-medium">Quick notes</h1>
          <p class="mt-1 text-11-regular text-text-weak">
            Capture thoughts from conversations and reading sessions. Notes are indexed by the knowledge graph.
          </p>
        </header>
        <Show when={notes.loading}>
          <p class="text-12-regular text-text-weak">Loading notes…</p>
        </Show>
        <Show when={!notes.loading && (notes()?.length ?? 0) === 0}>
          <div class="rounded-lg border border-dashed border-border-weak-base p-12 text-center text-12-regular text-text-weak">
            No notes yet. Use the "// " prefix in the composer or the "Save as quick note" button on any assistant reply.
          </div>
        </Show>
        <div class="space-y-3">
          <For each={notes()}>
            {(note) => (
              <article class="group rounded-lg border border-border-weak-base bg-background-base p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-mono text-10-regular text-text-weaker">{note.date}</p>
                    <h2 class="mt-1 text-13-medium text-text-base">{note.title}</h2>
                    <p class="mt-2 line-clamp-3 text-12-regular leading-5 text-text-weak">{note.preview}</p>
                    <Show when={note.tags.length > 0}>
                      <div class="mt-2 flex flex-wrap gap-1">
                        <For each={note.tags}>
                          {(tag) => <span class="rounded bg-background-stronger px-1.5 py-0.5 text-10-regular text-text-weak">#{tag}</span>}
                        </For>
                      </div>
                    </Show>
                  </div>
                  <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="small" variant="secondary" onClick={() => askAgent(note)}>Ask agent</Button>
                    <Button size="small" variant="ghost" onClick={() => setLinking(linking() === note.path ? undefined : note.path)}>Link to paper</Button>
                    <Button size="small" variant="ghost" onClick={() => openInGraph(note)}>Open in graph</Button>
                  </div>
                </div>
                <Show when={linking() === note.path}>
                  <div class="mt-3 rounded-md border border-border-weak-base bg-background-stronger p-3">
                    <div class="flex gap-2">
                      <input
                        class="h-8 min-w-0 flex-1 rounded border border-border-weak-base bg-background-base px-2 text-11-regular"
                        placeholder="Search papers to link…"
                        value={searchQuery()}
                        onInput={(event) => setSearchQuery(event.currentTarget.value)}
                        onKeyDown={(event) => event.key === "Enter" && void searchPapers()}
                      />
                      <Button size="small" variant="secondary" onClick={() => void searchPapers()}>Search</Button>
                    </div>
                    <Show when={searchResults().length > 0}>
                      <div class="mt-2 space-y-1">
                        <For each={searchResults()}>
                          {(paper) => (
                            <button
                              class="w-full rounded px-2 py-1.5 text-left text-11-regular hover:bg-background-base"
                              onClick={() => void linkPaper(note, paper)}
                            >
                              <span class="text-text-base">{paper.title}</span>
                              <span class="ml-2 text-10-regular text-text-weaker">{paper.id}{paper.year ? ` · ${paper.year}` : ""}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </div>
    </main>
  )
}

function parseNote(path: string, content: string): Note | undefined {
  const lines = content.split("\n")
  let date = ""
  const tags: string[] = []
  let bodyStart = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line === "---" && index === 0) continue
    if (line === "---" && index > 0) {
      bodyStart = index + 1
      break
    }
    if (line.startsWith("created:")) date = line.slice(8).trim()
    if (line.startsWith("tags:")) {
      const raw = line.slice(5).trim()
      tags.push(...raw.replace(/[\[\]]/g, "").split(",").map((tag) => tag.trim()).filter(Boolean))
    }
  }

  const body = lines.slice(bodyStart).join("\n").trim()
  if (!body) return undefined
  const title = body.split("\n")[0]?.replace(/^#+\s*/, "").trim() ?? "Untitled"
  const preview = body.split("\n").slice(1).join("\n").trim() || title
  return { path, title, date: date.slice(0, 10) || "unknown", preview, tags }
}
